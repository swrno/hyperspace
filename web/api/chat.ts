import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken, checkRateLimit, logMessageUsage } from './auth.js';
import { graphSearch, recallMemory, rememberMemory } from './cognee.js';
import { retrieveContext, retrieveNodeGraphContext } from './retrieval.js';
import { routeQuery } from './lib/router.js';
import { generateReply as llmGenerate, MODELS, type ProviderModel } from './lib/llm.js';

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]).catch(() => null);

// Build a grounding block from a single knowledge base — its documents (text)
// and attached source items — so a scoped chat answers straight from that base.
function buildKbContext(kb) {
  const parts = [];
  const docs = kb.documents || [];
  if (docs.length) {
    parts.push(`### Documents (${docs.length})`);
    for (const d of docs.slice(0, 15)) {
      const body = String(d.content || d.preview || '').replace(/\s+/g, ' ').slice(0, 1800);
      parts.push(`**${d.name}**${body ? ` — ${body}` : ''}`);
    }
  }
  for (const s of kb.sources || []) {
    const items = (s.items || []).map((i) => i.name).filter(Boolean);
    parts.push(`### Source: ${s.platform} (${items.length})\n${items.slice(0, 50).join(', ') || '(no items selected)'}`);
  }
  return parts.join('\n\n') || '(This knowledge base has no documents or sources yet.)';
}

// Capture Person-Specific Information from the user's message into Cognee
// memory (README §8) so future answers are personalised.
function maybeRememberPSI(userId, message) {
  if (/\b(i am|i'm|i prefer|i work on|my role|call me|i use|my team|i focus on|only show|i'm working)\b/i.test(message)) {
    rememberMemory(`User context: ${message}`, { userId }).catch(() => {});
  }
}

/**
 * Chat endpoint.
 *
 * Request : POST { message, history: [{role, content}], model }  (Bearer idToken)
 * Response: { response: string, title?: string }
 *
 * Routes across multiple providers with automatic fallback so a single
 * provider outage doesn't break chat. Model id chooses which provider leads.
 */

const SYSTEM_PROMPT = `You are hypr, an enterprise knowledge assistant. You answer questions by reasoning across the user's connected tools (GitHub, Jira, Google Docs & Slides, Slack, Salesforce), unified into a knowledge graph.

How to answer:
- Be specific and grounded. When context is provided below, base your answer on it and cite concrete identifiers: repository names, PR/issue numbers, Jira keys (e.g. PROJ-123), commit subjects, dates, and the source platform. Never be vague when the context contains specifics.
- Lead with a direct answer, then supporting detail. Do not restate the question or add filler. Match the response depth to the "Response depth" instruction below.
- If the context doesn't contain the answer, say exactly what's missing and where it likely lives — do not invent details.

Formatting (important):
- Use inline code with single backticks for identifiers, file paths, endpoints, repo names, branches, commands and short values — e.g. \`swrno/hyperspace\`, \`/api/chat\`, \`main\`.
- Use a fenced code block ONLY for genuine multi-line code, config, or terminal commands, and always tag the language (\`\`\`js). NEVER wrap a single short value or path in a fenced block.
- Use ## / ### headings only when the answer has multiple real sections. Use tables for comparisons. Bold key terms sparingly.`;

// LLM routing (Fireworks only, multi-key rotation) lives in lib/llm.ts.
// Modes below only choose which Fireworks model leads the chain.

// Per-mode answer depth instruction (drives how long/structured the reply is).
export const MODE_STYLE = {
  normal: 'Concise and direct — answer in 1–4 sentences or a short bulleted list. Don\'t pad.',
  deep: 'Thorough. Give the answer, then explain the reasoning and the relevant cross-source connections. A few short paragraphs or a structured list. Use ## sections if there are multiple parts.',
  hyper: 'Comprehensive and analytical. Produce an in-depth, well-structured report: a direct answer, then detailed analysis using ## sections and bullet points — cover cross-source connections (repos ↔ issues ↔ PRs ↔ docs ↔ people), status, implications, and any notable patterns or risks. Be genuinely thorough; do NOT be terse. Aim for several substantive sections.',
};

/**
 * Retrieval modes — the only thing the frontend knows about. Each maps a
 * user-facing depth to (a) an LLM fallback chain of the best model per provider,
 * (b) the Cognee graph search type, (c) retrieval breadth, and (d) answer length.
 * Provider names and model ids are never exposed to the client.
 */
// Fireworks (primary, multi-key) leads every chain; Groq is the fallback and
// Gemini the last resort. Model ids are centralised in lib/llm.ts (MODELS).
const MODES: Record<string, { searchType: string; topK: number; timeout: number; maxTokens: number; chain: ProviderModel[] }> = {
  normal: {
    searchType: 'GRAPH_COMPLETION', topK: 8, timeout: 6000, maxTokens: 1024,
    chain: [['fireworks', MODELS.fireworksPrimary], ['fireworks', MODELS.fireworksLarge]],
  },
  deep: {
    searchType: 'GRAPH_COMPLETION_DECOMPOSITION', topK: 12, timeout: 10000, maxTokens: 2800,
    chain: [['fireworks', MODELS.fireworksLarge], ['fireworks', MODELS.fireworksPrimary]],
  },
  hyper: {
    searchType: 'GRAPH_COMPLETION_COT', topK: 16, timeout: 15000, maxTokens: 4096,
    chain: [['fireworks', MODELS.fireworksLarge], ['fireworks', MODELS.fireworksPrimary]],
  },
};
export const resolveMode = (m) => (MODES[m] ? m : 'normal');

async function generateReply(messages, modeId) {
  const mode = MODES[resolveMode(modeId)];
  return llmGenerate(messages, mode.chain, { maxTokens: mode.maxTokens });
}

async function generateTitle(message) {
  try {
    const out = await generateReply([
      { role: 'system', content: 'Generate a short 3-5 word title for a conversation that starts with the user message below. Reply with only the title - no quotes, no punctuation.' },
      { role: 'user', content: message },
    ], 'normal');
    return out?.replace(/^["']|["']$/g, '').split('\n')[0].slice(0, 60);
  } catch { return null; }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);

    const rate = await checkRateLimit(user);
    if (!rate.allowed) {
      return res.status(429).json({ error: `Hourly limit reached (${rate.limit}/hr). Please try again later.` });
    }

    const { message, history = [], model, kbId } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // Retrieval depth comes from the selected mode (normal / deep / hyper).
    const modeId = resolveMode(model);
    const mode = MODES[modeId];
    const depthPrompt = `${SYSTEM_PROMPT}\n\nResponse depth: ${MODE_STYLE[modeId]}`;

    // If the user scoped the chat to a single knowledge base, answer straight
    // from that base's documents + attached sources (no global graph bleed-in).
    let kbScope = null;
    if (kbId) {
      try {
        const db = await getDb();
        const kb = await db.collection('knowledge_bases').findOne({ _id: kbId, userId: user.uid });
        if (kb) kbScope = { name: kb.name, context: buildKbContext(kb) };
      } catch (e) { console.warn('KB scope load failed:', e.message); }
    }

    let systemContent;
    if (kbScope) {
      const [memory, nodeGraph] = await Promise.all([
        withTimeout(recallMemory(message, { userId: user.uid }), 2500),
        retrieveNodeGraphContext(user.uid, message, { kbId }).catch(() => null),
      ]);
      const blocks = [];
      if (memory) blocks.push(`## What hypr remembers about you\n${memory}`);
      blocks.push(`## Knowledge base "${kbScope.name}"\n${kbScope.context}`);
      if (nodeGraph) blocks.push(`## Knowledge graph (entities & relations)\n${nodeGraph}`);
      systemContent = `${depthPrompt}\n\n# Scope: knowledge base "${kbScope.name}"\nThe user is asking specifically about this knowledge base. Answer using ONLY the content below. Cite document names and source items. If the answer isn't present, say it isn't in this knowledge base and suggest what to add.\n\n${blocks.join('\n\n')}`;
    } else {
      // Otherwise ground from three sources in parallel (README §6 hybrid retrieval):
      //  1. Cognee graph search — multi-hop GraphRAG reasoning at the chosen depth.
      //  2. Local Mongo graph (kb_entities) — deterministic, instant, user-scoped.
      //  3. Personal memory (PSI) — what hypr knows about this user.
      const route = routeQuery(message);
      const searchType = route.mode === 'global' ? 'GRAPH_SUMMARY_COMPLETION' : mode.searchType;
      const [cogneeAnswer, localContext, nodeGraph, memory] = await Promise.all([
        withTimeout(graphSearch(message, { userId: user.uid, searchType, topK: mode.topK }), mode.timeout),
        retrieveContext(user.uid, message).catch(() => null),
        retrieveNodeGraphContext(user.uid, message).catch(() => null),
        withTimeout(recallMemory(message, { userId: user.uid }), 2500),
      ]);

      const ctxParts = [];
      if (memory) ctxParts.push(`## What hypr remembers about you\n${memory}`);
      if (cogneeAnswer) ctxParts.push(`## Knowledge graph reasoning (${route.mode} search)\n${cogneeAnswer}`);
      if (localContext) ctxParts.push(`## Connected data (structured index)\n${localContext}`);
      if (nodeGraph) ctxParts.push(`## Knowledge graph (entities & relations)\n${nodeGraph}`);
      const kgContext = ctxParts.length ? ctxParts.join('\n\n') : null;

      systemContent = kgContext
        ? `${depthPrompt}\n\n# Grounding context\nThe following was retrieved from the user's connected tools and knowledge graph. Ground your answer in it and cite concrete identifiers (repos, PR/issue numbers, Jira keys, doc titles). If sources conflict, prefer the knowledge-graph reasoning.\n\n${kgContext}`
        : depthPrompt;
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...history.filter(m => m && m.role && m.content).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const reply = await generateReply(messages, modeId);
    if (!reply) throw new Error('Empty response from AI providers');

    await logMessageUsage(user);
    maybeRememberPSI(user.uid, message);

    // Auto-title brand-new conversations (no prior history).
    let title;
    if (!history.length) title = await generateTitle(message);

    return res.status(200).json({ response: reply, title, retrievalMode: modeId });
  } catch (error) {
    console.error('Error in /api/chat:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Failed to generate response' });
  }
}
