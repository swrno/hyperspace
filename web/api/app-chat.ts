import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { vectorSearch, hybridSearch, multiHopSearch } from './cognee.js';
import { verifyToken } from './auth.js';
import { retrieveNodeGraphContext } from './retrieval.js';
import { generateReply, DEFAULT_CHAIN, llmConfigured } from './lib/llm.js';

export default async function appChatHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { appId, message, systemPrompt, model, searchMode = 'normal', temperature, maxTokens, topP, history = [], linkedKbIds = [], sessionId = 'default' } = req.body;

    if (!appId || !message) {
      return res.status(400).json({ error: 'appId and message are required' });
    }

    let userId = 'anonymous';
    try {
      const user = await verifyToken(req);
      if (user && user.uid) {
        userId = user.uid;
      }
    } catch (err) {
      // Allow fallback if needed, or reject
      if (req.headers.authorization && req.headers.authorization.length > 10) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!llmConfigured()) {
      return res.status(500).json({ error: 'No LLM provider configured (set FIREWORKS_API_KEY or FIREWORKS_API_KEYS)' });
    }

    const messages = [];

    // ── Hybrid Retrieval: Graph Traversal + Vector Search + RRF Merge ──────
    // For each linked KB, run the hybrid retriever which does:
    //   1. GRAPH_COMPLETION — multi-hop graph traversal over the KB's Cognee graph
    //   2. CHUNKS — vector similarity search over the KB's ingested documents
    //   3. Reciprocal Rank Fusion — merges both ranked lists into a single context
    // Each KB has its own isolated Cognee dataset (hypr_kb_<kbId>).
    let retrievedContext = '';
    let kbMeta: { name: string; sources: any[] }[] = [];

    if (linkedKbIds && linkedKbIds.length > 0) {
      // Load KB metadata from MongoDB (always needed for system prompt framing).
      try {
        const db = await getDb();
        const kbs = await db.collection('knowledge_bases')
          .find({ _id: { $in: linkedKbIds }, userId })
          .toArray();
        kbMeta = kbs.map((k: any) => ({ name: k.name, sources: k.sources || [] }));

        // ── MongoDB document retrieval ──────────────────────────────────────
        // Keyword-rank docs, but ALWAYS include the top 3 even when score=0
        // so vague/exploratory questions ("What do you know?") still get context.
        const queryTokens = message.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
        const scored: { text: string; score: number }[] = [];

        for (const kb of kbs) {
          for (const doc of (kb.documents || [])) {
            if (!doc.content?.trim()) continue;
            const hay = `${doc.name} ${doc.content}`.toLowerCase();
            const score = queryTokens.reduce((n: number, t: string) => n + (hay.includes(t) ? 1 : 0), 0);
            scored.push({ score, text: `[KB: ${kb.name}] ${doc.name}:\n${doc.content.slice(0, 3000)}` });
          }
        }

        scored.sort((a, b) => b.score - a.score);
        // Take keyword-matched docs first; always include up to 3 regardless of score.
        const relevant = scored.filter(s => s.score > 0).slice(0, 5);
        if (relevant.length < 3) {
          const extras = scored.filter(s => s.score === 0).slice(0, 3 - relevant.length);
          relevant.push(...extras);
        }
        if (relevant.length > 0) {
          retrievedContext = relevant.map(s => s.text).join('\n\n---\n\n');
        }
      } catch (err) {
        console.warn('KB direct retrieval failed:', err);
      }

      // ── Graph/vector retrieval, depth chosen by searchMode ──────────────
      // Run in parallel with (or after) MongoDB. If this returns results,
      // prepend them — they are semantically richer than keyword matching.
      //   normal — fast vector lookup only
      //   hyper  — hybrid graph + vector, reranked
      //   deep   — multi-hop: planner decomposes the query, each sub-question
      //            runs the hybrid+rerank pipeline
      try {
        const fetchPromises = linkedKbIds.map((kbId: string) => {
          if (searchMode === 'deep') return multiHopSearch(message, { userId, kbId, topK: 10 });
          if (searchMode === 'hyper') return hybridSearch(message, { userId, kbId, topK: 10 });
          return vectorSearch(message, { userId, kbId, topK: 10 }).then((chunks) => chunks.join('\n\n') || null);
        });
        const results = await Promise.all(fetchPromises);
        const parts = results.filter((r): r is string => !!r);
        if (parts.length > 0) {
          // Graph/vector results take priority — prepend to any MongoDB context.
          retrievedContext = parts.join('\n\n---\n\n')
            + (retrievedContext ? '\n\n---\n\n' + retrievedContext : '');
        }
      } catch (err) {
        console.warn('Graph/vector search failed:', err);
      }

      // ── Node-graph instant cache (kb_nodes) ─────────────────────────────
      // Surfaces attached-source content (docs/issues/events) the moment it's
      // ingested — before Cognee's async graph catches up, and even when its
      // NER was rate-limited. This is where attached Google Docs / Jira text
      // actually lives, so it fills the gap MongoDB docs + Cognee leave.
      try {
        const ngResults = await Promise.all(
          linkedKbIds.map((kbId: string) =>
            retrieveNodeGraphContext(userId, message, { kbId }).catch(() => null)
          )
        );
        const ng = ngResults.filter((r): r is string => !!r).join('\n\n---\n\n');
        if (ng) retrievedContext = (retrievedContext ? retrievedContext + '\n\n---\n\n' : '') + ng;
      } catch (err) {
        console.warn('Node-graph retrieval failed:', err);
      }
    }

    const DEFAULT_SYSTEM_PROMPT = `## Role & Purpose
You are My Assistant, an enterprise workspace search engine designed to connect GitHub repositories and document libraries, providing a unified search experience for users across the organization. Your role is to assist users in finding relevant information, code snippets, and documents from GitHub and the company's document management system, leveraging the Swarnendu Data knowledge base to enhance search results and provide contextual insights.

## Core Capabilities
Your core capabilities include:
* Searching and retrieving code snippets from GitHub repositories based on specific keywords, functions, or project names
* Indexing and searching document libraries, including PDFs, Word documents, and PowerPoint presentations
* Providing contextual suggestions and recommendations for related documents and code snippets
* Offering code completion suggestions based on the user's search query and GitHub repository data
* Generating summaries of long documents and code files to help users quickly understand the content
* Identifying and suggesting relevant GitHub repositories and documents based on the user's search history and preferences
* Supporting natural language queries and providing relevant search results

## Tone & Communication Style
Your tone should be professional, concise, and helpful, with a focus on providing accurate and relevant information. You should communicate in a clear and straightforward manner, avoiding technical jargon and complex terminology whenever possible. Your language should be formal, yet approachable, making you an invaluable resource for users across the organization.

## Response Format
Your responses should be structured to provide clear and concise answers, with a maximum length of 200-250 words. You should use bullet points and numbered lists to present multiple options or suggestions, and include code snippets or examples when relevant. When necessary, you should ask clarifying questions to ensure you understand the user's query and provide the most accurate results. You should also include links to relevant GitHub repositories or documents when available.

## Constraints & Guardrails
You must not provide access to sensitive or confidential information, and should always respect user privacy and data security. You should stay on-topic and avoid providing irrelevant or unrelated information, and should escalate complex or high-priority issues to the appropriate support teams when necessary. You should also be aware of and comply with all organizational policies and guidelines related to data access and usage.

## Knowledge Base Usage
When using the Swarnendu Data knowledge base, you should cite and reference the source of any retrieved information, and clearly indicate when the knowledge base is being used to provide contextual insights or suggestions. If the context is insufficient to provide an accurate answer, you should ask clarifying questions or request additional information from the user before attempting to retrieve information from the knowledge base.`;

    let finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Always tell the LLM what knowledge bases are linked, even if retrieval
    // returns nothing — so it can say "I have access to X but couldn't find..."
    // instead of answering purely from its training data.
    if (kbMeta.length > 0) {
      const kbList = kbMeta.map(k => {
        const srcList = k.sources.flatMap((s: any) => (s.items || []).map((i: any) => i.name)).join(', ');
        return `- "${k.name}"${srcList ? ` (sources: ${srcList})` : ''}`;
      }).join('\n');
      finalSystemPrompt += `\n\n# Linked Knowledge Bases\nYou have access to the following knowledge bases:\n${kbList}\nAnswer questions using the content from these knowledge bases. If the retrieved context below is insufficient, say what you found and what's missing — do NOT answer from your general training data as if you have no KB access.`;
    }

    if (retrievedContext) {
      finalSystemPrompt += `\n\n# Retrieved Context\nThe following was retrieved from the knowledge base. Use it to answer accurately:\n\n${retrievedContext}`;
    } else if (kbMeta.length > 0) {
      finalSystemPrompt += `\n\n# Retrieved Context\nNo specific documents were retrieved for this query. Let the user know what knowledge bases you have access to and suggest they ask more specific questions.`;
    }

    // Reasoning models expose their chain-of-thought via a separate field
    // (stripped out server-side into `reasoning`); this guards against models
    // that inline it as prose instead, which would otherwise leak "let me
    // think..." drafting into the visible answer.
    finalSystemPrompt += `\n\n# Output Discipline\nRespond with ONLY the final answer. Do not narrate your reasoning process, list the steps you took, or include drafting notes ("let me think...", "first I'll...") in the response — think privately and output just the polished answer.`;

    messages.push({ role: 'system', content: finalSystemPrompt });
    
    // Add history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    
    // Add new user message
    messages.push({ role: 'user', content: message });

    // Fireworks only (multi-key). A caller-supplied `model` (a Fireworks id)
    // leads the chain; otherwise the default Fireworks primary.
    const chain = model
      ? [['fireworks', model], ...DEFAULT_CHAIN] as typeof DEFAULT_CHAIN
      : DEFAULT_CHAIN;
    const { content: replyContent, reasoning } = await generateReply(messages, chain, {
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 1024,
      topP: topP ?? 1,
    });

    // Save messages to MongoDB
    const db = await getDb();
    const appsCollection = db.collection('apps');

    const userMsgObj = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString(), sessionId };
    const aiMsgObj = { id: Date.now() + 1, role: 'assistant', content: replyContent, reasoning: reasoning || undefined, timestamp: new Date().toISOString(), sessionId };

    await appsCollection.updateOne(
      { id: appId },
      { $push: { messages: { $each: [userMsgObj, aiMsgObj] } } }
    );

    return res.status(200).json({
      userMessage: userMsgObj,
      aiMessage: aiMsgObj
    });
  } catch (error: any) {
    console.error('Error in app chat:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
}
