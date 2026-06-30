import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { hybridSearch } from './cognee.js';
import { verifyToken } from './auth.js';

export default async function appChatHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { appId, message, systemPrompt, model, temperature, maxTokens, topP, history = [], linkedKbIds = [], sessionId = 'default' } = req.body;

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

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
    }

    const messages = [];

    // ── Hybrid Retrieval: Graph Traversal + Vector Search + RRF Merge ──────
    // For each linked KB, run the hybrid retriever which does:
    //   1. GRAPH_COMPLETION — multi-hop graph traversal over the KB's Cognee graph
    //   2. CHUNKS — vector similarity search over the KB's ingested documents
    //   3. Reciprocal Rank Fusion — merges both ranked lists into a single context
    // Each KB has its own isolated Cognee dataset (hypr_kb_<kbId>).
    let retrievedContext = '';
    if (linkedKbIds && linkedKbIds.length > 0) {
      try {
        const fetchPromises = linkedKbIds.map((kbId: string) =>
          hybridSearch(message, { userId, kbId, topK: 10 })
        );
        const results = await Promise.all(fetchPromises);
        const parts = results.filter(r => r);
        if (parts.length > 0) {
          retrievedContext = parts.join('\n\n---\n\n');
        }
      } catch (err) {
        console.warn('Failed to retrieve from Cognee KBs:', err);
      }

      // ── Fallback: direct MongoDB KB document retrieval ──────────────────
      // Cognee may not have indexed the data yet (cognify is async + debounced)
      // or the dataset search may return nothing. Always ground the answer in
      // the raw KB documents that ARE stored in MongoDB so the LLM has real
      // context regardless of Cognee's state.
      if (!retrievedContext) {
        try {
          const db = await getDb();
          const kbs = await db.collection('knowledge_bases')
            .find({ _id: { $in: linkedKbIds }, userId })
            .toArray();

          // Keyword score so the most-relevant docs surface first.
          const queryTokens = message.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
          const scored: { text: string; score: number }[] = [];

          for (const kb of kbs) {
            for (const doc of (kb.documents || [])) {
              if (!doc.content?.trim()) continue;
              const hay = `${doc.name} ${doc.content}`.toLowerCase();
              const score = queryTokens.reduce((n: number, t: string) => n + (hay.includes(t) ? 1 : 0), 0);
              // Always include when there are ≤3 docs; otherwise keyword-gate.
              if (score > 0 || (kb.documents || []).length <= 3) {
                scored.push({
                  score,
                  text: `[KB: ${kb.name}] ${doc.name}:\n${doc.content.slice(0, 3000)}`,
                });
              }
            }
          }

          scored.sort((a, b) => b.score - a.score);
          if (scored.length > 0) {
            retrievedContext = scored.slice(0, 5).map(s => s.text).join('\n\n---\n\n');
          }
        } catch (err) {
          console.warn('KB direct fallback retrieval failed:', err);
        }
      }
    }

    let finalSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
    if (retrievedContext) {
      finalSystemPrompt += `\n\n# Context from Knowledge Base:\nThe following information is retrieved from the knowledge base using hybrid search (graph traversal + vector search). Use it to answer the user's question accurately. If the context is insufficient, say so.\n\n${retrievedContext}`;
    }

    messages.push({ role: 'system', content: finalSystemPrompt });
    
    // Add history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    
    // Add new user message
    messages.push({ role: 'user', content: message });

    // Call Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: model || 'qwen/qwen3.6-27b',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 1024,
        top_p: topP ?? 1
      })
    });

    if (!groqRes.ok) {
      const errTxt = await groqRes.text();
      console.error('Groq API Error:', errTxt);
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const groqData = await (groqRes.json() as any);
    const replyContent = groqData.choices?.[0]?.message?.content || '';

    // Save messages to MongoDB
    const db = await getDb();
    const appsCollection = db.collection('apps');
    
    const userMsgObj = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString(), sessionId };
    const aiMsgObj = { id: Date.now() + 1, role: 'assistant', content: replyContent, timestamp: new Date().toISOString(), sessionId };

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
