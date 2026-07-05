import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken, checkRateLimit, logMessageUsage } from './auth.js';
import { hybridSearch, multiHopSearch } from './cognee.js';
import { recallUserContext, rememberUserFact } from './lib/cogneeMemory.js';
import { retrieveContext, retrieveNodeGraphContext } from './retrieval.js';
import { routeQuery } from './lib/router.js';
import { generateReply as llmGenerate, NORMAL_CHAIN, DEEP_CHAIN, type ProviderModel } from './lib/llm.js';

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
// memory (README §8) so future answers are personalised — the "agent memory
// that never forgets". Broad first-person / declarative trigger so genuine
// facts and preferences are captured, while questions (what/how/why/…, which
// lack these markers) are not stored as noise.
const PSI_RE = /\b(i am|i'm|i've|i have|my name|call me|i prefer|i like|i love|i hate|i don'?t|i do not|i use|i work|i'm working|i'm building|i focus|i need|i want|my role|my job|my team|my manager|my company|my project|my email|my stack|my goal|our team|our product|our company|we use|we are|we're|based in|i live|i'm responsible|only show|remember that|remember i|note that|keep in mind|for future|going forward)\b/i;
function maybeRememberPSI(userId, message) {
  if (PSI_RE.test(message)) {
    rememberUserFact(userId, `User context: ${message}`).catch(() => {});
  }
}

/**
 * Chat endpoint.
 *
 * Request : POST { message, history: [{role, content}], mode }  (Bearer idToken)
 *           mode: 'normal' | 'deep' — selects retrieval depth + model chain.
 * Response: { response: string, title?: string }
 *
 * Routes across a Fireworks model chain with automatic fallback so a single
 * model outage doesn't break chat.
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
// Normal mode uses the fast general-purpose chain (NORMAL_CHAIN) fed by
// hybridSearch (graph + vector, reranked); deep mode uses the Deep Hyper
// Search synthesis chain (DEEP_CHAIN) fed by multiHopSearch's planner +
// reranker pipeline PLUS a direct hybridSearch pass, merged for broader
// coverage than multi-hop alone.

// Per-mode answer depth instruction (drives how long/structured the reply is).
export const MODE_STYLE = {
  normal: 'Concise and direct — answer in 1–4 sentences or a short bulleted list. Don\'t pad.',
  deep: 'Comprehensive and analytical. Produce an in-depth, well-structured report: a direct answer, then detailed analysis using ## sections and bullet points — cover cross-source connections (repos ↔ issues ↔ PRs ↔ docs ↔ people), status, implications, and any notable patterns or risks. Be genuinely thorough; do NOT be terse. Aim for several substantive sections.',
};

/**
 * Retrieval modes — the only thing the frontend knows about. Each maps a
 * user-facing depth to (a) an LLM fallback chain of the best model per provider,
 * (b) retrieval breadth, and (c) answer length.
 * Provider names and model ids are never exposed to the client.
 */
// Fireworks (primary, multi-key) leads every chain; Groq is the fallback and
// Gemini the last resort. Model ids are centralised in lib/llm.ts (MODELS).
const MODES: Record<string, { topK: number; timeout: number; maxTokens: number; chain: ProviderModel[]; deep?: boolean }> = {
  normal: {
    // Headroom above 1024 so a reasoning model that thinks inline still has
    // budget left for the actual answer (otherwise the reply is truncated
    // mid-thought and comes back empty / as leaked chain-of-thought).
    topK: 8, timeout: 6000, maxTokens: 2048,
    chain: NORMAL_CHAIN,
  },
  deep: {
    topK: 16, timeout: 20000, maxTokens: 4096,
    chain: DEEP_CHAIN, deep: true,
  },
};
export const resolveMode = (m) => (MODES[m] ? m : 'normal');

async function generateReply(messages, modeId) {
  const mode = MODES[resolveMode(modeId)];
  return llmGenerate(messages, mode.chain, { maxTokens: mode.maxTokens });
}

async function generateTitle(message) {
  try {
    const { content: out } = await generateReply([
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

    const { message, history = [], mode: modeParam, model, kbId } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // Retrieval depth comes from the selected mode (normal / deep).
    // `mode` is the current field name; `model` is kept as a fallback for older clients.
    const modeId = resolveMode(modeParam ?? model);
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
        withTimeout(recallUserContext(user.uid, message), 6000),
        retrieveNodeGraphContext(user.uid, message, { kbId }).catch(() => null),
      ]);
      const blocks = [];
      if (memory) blocks.push(`## What hypr remembers about you\n${memory}`);
      blocks.push(`## Knowledge base "${kbScope.name}"\n${kbScope.context}`);
      if (nodeGraph) blocks.push(`## Knowledge graph (entities & relations)\n${nodeGraph}`);
      systemContent = `${depthPrompt}\n\n# Scope: knowledge base "${kbScope.name}"\nThe user is asking specifically about this knowledge base. Answer using ONLY the content below. Cite document names and source items. If the answer isn't present, say it isn't in this knowledge base and suggest what to add.\n\n${blocks.join('\n\n')}`;
    } else {
      // Otherwise ground from three sources in parallel (README §6 hybrid retrieval):
      //  1. Graph/vector search — hybridSearch (graph + vector, reranked) for
      //     normal mode; deep mode additionally runs multiHopSearch (planner
      //     decomposition + hybridSearch per sub-question) and merges both.
      //  2. Local Mongo graph (kb_entities) — deterministic, instant, user-scoped.
      //  3. Personal memory (PSI) — what hypr knows about this user.
      const route = routeQuery(message);
      const graphOpts = { userId: user.uid, kbId: undefined, topK: mode.topK };
      const cogneeSearch = mode.deep
        ? Promise.all([multiHopSearch(message, graphOpts), hybridSearch(message, graphOpts)])
            .then(([a, b]) => [a, b].filter(Boolean).join('\n\n') || null)
        : hybridSearch(message, graphOpts);
      const [cogneeAnswer, localContext, nodeGraph, memory] = await Promise.all([
        withTimeout(cogneeSearch, mode.timeout),
        retrieveContext(user.uid, message).catch(() => null),
        retrieveNodeGraphContext(user.uid, message).catch(() => null),
        withTimeout(recallUserContext(user.uid, message), 6000),
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

    const { content: reply, reasoning } = await generateReply(messages, modeId);
    if (!reply) throw new Error('Empty response from AI providers');

    await logMessageUsage(user);
    maybeRememberPSI(user.uid, message);

    // Auto-title brand-new conversations (no prior history).
    let title;
    if (!history.length) title = await generateTitle(message);

    return res.status(200).json({ response: reply, reasoning: reasoning || undefined, title, retrievalMode: modeId });
  } catch (error) {
    console.error('Error in /api/chat:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Failed to generate response' });
  }
}
