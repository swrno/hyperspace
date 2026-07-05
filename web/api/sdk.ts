/**
 * Public hypr-sdk surface — what hypr-sdk's HyperClient talks to. Callers
 * authenticate with (apiKey, appId, clientId) instead of a Firebase token (see
 * lib/sdkAuth.ts) and always supply their own end-user `userId`.
 *
 *   simpleRetriver → POST /api/sdk/query   { mode: 'simple' } (default)
 *   hyperRetriever → POST /api/sdk/query   { mode: 'hyper' }
 *   ingestor       → POST /api/sdk/ingest
 */
import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { addText, hybridSearch, multiHopSearch, vectorSearch } from './cognee.js';
import { recallUserContext, rememberUserFact } from './lib/cogneeMemory.js';
import { generateReply, DEFAULT_CHAIN, DEEP_CHAIN } from './lib/llm.js';
import { ensureAppUser, appendConversationTurn } from './lib/appUsers.js';
import { verifySdkAuth, SdkAuthError } from './lib/sdkAuth.js';

function sendAuthError(res: Response, e: any) {
  if (e instanceof SdkAuthError) return res.status(e.status).json({ error: e.message });
  console.error('SDK auth error:', e.message);
  return res.status(500).json({ error: 'Internal server error' });
}

/**
 * POST /api/sdk/query
 * body: { apiKey?, appId?, clientId?, userId, message, mode?: 'simple'|'hyper', sessionId?, personalisation? }
 * (apiKey/appId/clientId may instead be sent as X-Api-Key / X-App-Id / X-Client-Id headers.)
 *
 * `personalisation` toggles Cognee memory recall/write independently of
 * `mode` (which only controls Neo4j KB search depth) — hyper mode always
 * personalizes; simple mode does too if this is `true`.
 */
export async function sdkQueryHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let auth;
  try {
    auth = await verifySdkAuth(req);
  } catch (e: any) {
    return sendAuthError(res, e);
  }
  const { app, userId } = auth;
  const { message, mode = 'simple', sessionId = 'default', personalisation } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

  try {
    await ensureAppUser(app.appId, userId).catch(() => {});
    const ownerId = app.userId; // the app owner's KB data is scoped to their own uid
    const kbIds: string[] = app.linkedKbIds || [];
    const isHyper = mode === 'hyper';
    // Memory is independent of search depth — hyper mode always personalizes;
    // simple mode only does if the caller opts in via `personalisation: true`.
    const usePersonalization = isHyper || personalisation === true;

    // Knowledge Base retrieval (Neo4j) — simple mode does a fast single-shot
    // vector lookup per KB; hyper mode runs the full multi-hop planner+rerank.
    const kbResults = await Promise.all(
      kbIds.map((kbId) =>
        isHyper
          ? multiHopSearch(message, { userId: ownerId, kbId, topK: 10 })
          : vectorSearch(message, { userId: ownerId, kbId, topK: 10 }).then((c) => c.join('\n\n') || null)
      )
    );
    const kbContext = kbResults.filter(Boolean).join('\n\n---\n\n');

    // Memory (Cognee) — personalized to this end-user, if enabled.
    const memory = usePersonalization ? await recallUserContext(userId, message).catch(() => null) : null;

    let systemPrompt = app.systemPrompt || 'You are a helpful AI assistant.';
    if (kbContext) systemPrompt += `\n\n# Retrieved Context\n${kbContext}`;
    if (memory) systemPrompt += `\n\n# Facts remembered about this user\nRaw notes from this user's own past conversations — quoted verbatim, phrasing may be first- or second-person from the original context. This is a mix of durable facts (identity, preferences, ongoing context) and one-off scratch content (hypothetical drafts, test messages, names mentioned in passing) — it is NOT a verified profile. Use a note only if it's clearly still true and directly relevant to the current message. Never treat a name, role, or detail mentioned in an old, unrelated note as this user's own identity or authorship unless it's unambiguous; if a note conflicts with what the user is telling you right now (or with retrieved KB context like their resume), trust the current message and KB context over the old note.\n"""\n${memory}\n"""`;
    systemPrompt += `\n\n# Output Discipline\nRespond with ONLY the final answer — no reasoning narration.`;

    const chain = isHyper ? DEEP_CHAIN : DEFAULT_CHAIN;
    const { content } = await generateReply(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
      chain,
      { temperature: app.temperature ?? 0.7, maxTokens: app.maxTokens ?? 1024 },
    );

    const userMsgObj = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString(), sessionId };
    const aiMsgObj = { id: Date.now() + 1, role: 'assistant', content, timestamp: new Date().toISOString(), sessionId };
    appendConversationTurn(app.appId, userId, sessionId, [userMsgObj, aiMsgObj]).catch(() => {});
    if (usePersonalization) rememberUserFact(userId, `User: ${message}\nAssistant: ${content}`).catch(() => {});

    return res.status(200).json({ response: content, mode });
  } catch (e: any) {
    console.error('SDK query error:', e.message);
    return res.status(500).json({ error: e.message || 'Failed to generate response' });
  }
}

/**
 * POST /api/sdk/ingest
 * body: { apiKey?, appId?, clientId?, userId, kbId, text, docName? }
 * Ingests content into one of the app's linked Knowledge Bases (Neo4j) — this
 * is about the app's shared documents, not the caller's own personalization
 * memory (which builds automatically from conversation turns via /query).
 */
export async function sdkIngestHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let auth;
  try {
    auth = await verifySdkAuth(req);
  } catch (e: any) {
    return sendAuthError(res, e);
  }
  const { app } = auth;
  const { kbId, text, docName } = req.body || {};
  if (!kbId || !text?.trim()) return res.status(400).json({ error: 'kbId and text are required' });
  if (!(app.linkedKbIds || []).includes(kbId)) {
    return res.status(403).json({ error: 'kbId is not linked to this app' });
  }

  try {
    const result = await addText(text, { userId: app.userId, kbId, docName });
    if (!result) return res.status(500).json({ error: 'Ingestion failed' });

    // Keep the KB's Mongo document count in sync for owner-facing UI.
    const db = await getDb();
    await db.collection('knowledge_bases').updateOne(
      { _id: kbId },
      { $push: { documents: { id: docName || `sdk_${Date.now()}`, name: docName || 'SDK ingestion', createdAt: new Date().toISOString() } } },
    );

    return res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error('SDK ingest error:', e.message);
    return res.status(500).json({ error: e.message || 'Failed to ingest' });
  }
}
