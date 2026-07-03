import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { ingest as cogneeIngest, cognify, formatConnectorPayload, ingestGitHubEntity } from './cognee.js';
import { textFromBase64 } from './lib/pdf.js';
import { getConnection, getAccessToken } from './connections.js';
import { buildNodeGraphForProvider } from './ingest.js';
import * as github from './lib/github.js';

// Connectors that feed the additive Source/Chunk/Entity node graph, and the
// OAuth provider whose stored connection holds each one's token.
const NODE_GRAPH_PLATFORMS = ['gdocs', 'gslides', 'jira', 'gcal'];
const oauthProviderForPlatform = (p: string) =>
  ['gdocs', 'gslides', 'gsheets', 'gcal'].includes(p) ? 'google' : p;

/** Per-KB Cognee tag so a knowledge base's graph is built only from its own
 *  documents and attached sources (README §4 — graph "based on sources"). */
const kbNodeSet = (kbId: string) => `kb:${kbId}`;

/** In-memory ingestion progress — keyed by kbId. Cleared 10 min after done. */
export const ingestProgress = new Map<string, {
  phase: string;
  pct: number;
  done: boolean;
  error?: string;
  startedAt: number;
}>();

/**
 * Knowledge Base endpoint.
 *
 * Per user, stores named knowledge bases and the documents inside them.
 * Documents are lightweight here (pasted text or a resource link) so the
 * flow works end to end without external file storage. Mirrors the storage
 * pattern used by /api/chats.
 *
 * Routes (all on /api/kb):
 *   GET                                  -> { kbs: [...] }
 *   POST { action:'create', kb }         -> create a knowledge base
 *   POST { action:'add-doc', kbId, doc } -> append a document
 *   POST { action:'delete-doc', kbId, docId }
 *   POST { action:'rename', kbId, name, description }
 *   DELETE ?id=<kbId>                    -> remove a knowledge base
 */

const newId = () =>
  'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export default async function handler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    const user = await verifyToken(req);
    const db = await getDb();
    const kbCol = db.collection('knowledge_bases');

    if (req.method === 'GET') {
      // Lightweight progress-poll endpoint — no DB hit needed.
      if (req.query.action === 'ingest-progress' && req.query.kbId) {
        const p = ingestProgress.get(String(req.query.kbId));
        if (!p) return res.status(200).json({ found: false });
        return res.status(200).json({ found: true, ...p });
      }

      const kbs = await kbCol
        .find({ userId: user.uid })
        .sort({ updatedAt: -1 })
        .toArray();

      const formatted = kbs.map((k) => ({
        id: k._id,
        name: k.name,
        description: k.description || '',
        documents: k.documents || [],
        sources: k.sources || [],
        createdAt: k.createdAt,
        updatedAt: k.updatedAt,
      }));

      return res.status(200).json({ kbs: formatted });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'create';
      const now = new Date().toISOString();

      if (action === 'create') {
        const name = (body.kb?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'A name is required' });
        const doc = {
          _id: newId(),
          userId: user.uid,
          name,
          description: (body.kb?.description || '').trim(),
          documents: [],
          sources: [],
          createdAt: now,
          updatedAt: now,
        };
        await kbCol.insertOne(doc);
        return res.status(200).json({ success: true, id: doc._id, kb: { ...doc, id: doc._id } });
      }

      if (action === 'add-doc') {
        const { kbId, doc } = body;
        if (!kbId || !doc?.name) {
          return res.status(400).json({ error: 'kbId and a document name are required' });
        }
        // Text arrives inline for text files; PDFs/binaries arrive as base64 and
        // are extracted server-side so the LLM sees real content, not an empty stub.
        let content = String(doc.content || '');
        if (!content && doc.contentBase64) {
          content = await textFromBase64(doc.contentBase64, doc.name);
        }
        const entry = {
          id: newId(),
          name: String(doc.name).slice(0, 160),
          type: doc.type || 'text',
          size: content.length,
          preview: content.slice(0, 240),
          content: content.slice(0, 100000),
          status: content.trim() ? 'ready' : 'empty',
          createdAt: now,
        };
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $push: { documents: entry }, $set: { updatedAt: now } }
        );

        // Stage into Cognee + trigger graph extraction (cognify) so chat can
        // reason over this document. Tag with this KB's nodeSet so its graph is
        // scoped to its own documents and sources.
        if (content.trim()) {
          const header = `# Knowledge Base Document: ${entry.name}\nKnowledge Base ID: ${kbId}\n\n`;
          cogneeIngest(header + content.slice(0, 100000), {
            userId: user.uid,
            kbId,
            nodeSet: ['kb', kbNodeSet(kbId)],
          }).catch((e) => console.warn('KB Cognee ingest failed (non-fatal):', e.message));
        }

        return res.status(200).json({ success: true, doc: entry, parsed: content.trim().length });
      }

      if (action === 'delete-doc') {
        const { kbId, docId } = body;
        if (!kbId || !docId) {
          return res.status(400).json({ error: 'kbId and docId are required' });
        }
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $pull: { documents: { id: docId } }, $set: { updatedAt: now } }
        );
        return res.status(200).json({ success: true });
      }

      // ── Attach a globally-authorized source (repo, docs…) to this KB ──────
      // The KB graph + mindmap are built from its attached sources, so the
      // selected items are also staged into Cognee under this KB's nodeSet.
      if (action === 'attach-source') {
        const { kbId, platform, items = [] } = body;
        if (!kbId || !platform) return res.status(400).json({ error: 'kbId and platform are required' });
        const source = {
          platform,
          items: (Array.isArray(items) ? items : []).map((i) => ({
            id: String(i.id), name: String(i.name || i.id).slice(0, 200), meta: i.meta ? String(i.meta).slice(0, 200) : '',
          })),
          attachedAt: now,
        };
        // Replace any existing source for this platform, then add the new one.
        await kbCol.updateOne({ _id: kbId, userId: user.uid }, { $pull: { sources: { platform } } });
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $push: { sources: source }, $set: { updatedAt: now } }
        );
        if (source.items.length) {
          const payload = formatConnectorPayload(kbId, user.uid, user.email, platform, source.items);

          // Non-GitHub live connectors: progress-tracked ingestion so the KB card
          // shows a spinner + phases like GitHub does. Runs async; the response
          // returns immediately. Progress is keyed by kbId (same map GitHub uses).
          if (platform !== 'github') {
            ingestProgress.set(kbId, { phase: 'Starting…', pct: 3, done: false, startedAt: Date.now() });
            (async () => {
              try {
                ingestProgress.set(kbId, { phase: 'Indexing into knowledge graph…', pct: 25, done: false, startedAt: Date.now() });
                await cogneeIngest(payload, { userId: user.uid, kbId, nodeSet: ['kb', kbNodeSet(kbId)] });

                // Additive node graph, keyed by the REAL kbId (not the userId stand-in).
                if (NODE_GRAPH_PLATFORMS.includes(platform)) {
                  ingestProgress.set(kbId, { phase: 'Fetching & embedding content…', pct: 60, done: false, startedAt: Date.now() });
                  const conn = await getConnection(user.uid, oauthProviderForPlatform(platform));
                  if (conn) {
                    const token = await getAccessToken(conn);
                    await buildNodeGraphForProvider(user.uid, kbId, platform, source.items, token, conn);
                  }
                }
                ingestProgress.set(kbId, { phase: 'Complete', pct: 100, done: true, startedAt: Date.now() });
                setTimeout(() => ingestProgress.delete(kbId), 10 * 60 * 1000);
              } catch (e: any) {
                console.warn(`KB ingest failed for ${platform} (non-fatal):`, e.message);
                ingestProgress.set(kbId, { phase: `Failed: ${e.message}`, pct: 0, done: true, error: e.message, startedAt: Date.now() });
                setTimeout(() => ingestProgress.delete(kbId), 10 * 60 * 1000);
              }
            })();
          }

          if (platform === 'github') {
            cogneeIngest(payload, { userId: user.uid, kbId, nodeSet: ['kb', kbNodeSet(kbId)] })
              .catch((e) => console.warn('KB source Cognee ingest failed (non-fatal):', e.message));
            // Deep background ingestion — runs fully async so the HTTP response
            // returns immediately while content is streamed into Cognee.
            ingestProgress.set(kbId, { phase: 'Starting…', pct: 2, done: false, startedAt: Date.now() });
            (async () => {
              try {
                const conn = await getConnection(user.uid, 'github');
                let ghToken = conn ? await getAccessToken(conn) : null;
                // Fall back to a shared PAT (GITHUB_TOKEN env var) so the ingestion
                // still works even when the user hasn't completed the OAuth flow.
                ghToken = ghToken || process.env.GITHUB_TOKEN || null;
                if (!ghToken) throw new Error('No GitHub connection — connect GitHub in Integrations or set GITHUB_TOKEN');
                const repoNames = source.items.map((i: any) => i.name);

                console.log(`[KB ${kbId}] Starting deep GitHub snapshot for: ${repoNames.join(', ')}`);
                const { entities, documents } = await github.deepSnapshot(ghToken, repoNames, (phase, pct) => {
                  ingestProgress.set(kbId, { phase, pct: Math.min(pct, 84), done: false, startedAt: Date.now() });
                });
                console.log(`[KB ${kbId}] Snapshot complete — ${entities.length} entities, ${documents.length} documents`);

                const opts = { userId: user.uid, kbId, nodeSet: ['kb', kbNodeSet(kbId)] };
                const totalItems = entities.length + documents.length;
                let done = 0;

                const bumpIngest = () => {
                  done++;
                  const pct = 85 + Math.round((done / Math.max(totalItems, 1)) * 13);
                  ingestProgress.set(kbId, { phase: 'Indexing into knowledge graph…', pct: Math.min(pct, 98), done: false, startedAt: Date.now() });
                };

                ingestProgress.set(kbId, { phase: 'Indexing into knowledge graph…', pct: 85, done: false, startedAt: Date.now() });

                // First pass: ingest Repo nodes and build repoRef → neo4j id map.
                const repoIdMap = new Map<string, string>();
                for (const entity of entities) {
                  if (entity.type !== 'Repository') continue;
                  await ingestGitHubEntity('Repo', {
                    id: entity.id,
                    name: entity.title,
                    owner: entity.authorRef ?? '',
                    description: entity.body ?? '',
                    url: entity.url,
                  }, { kbId, userId: user.uid });
                  if (entity.repoRef) repoIdMap.set(entity.repoRef, entity.id);
                  bumpIngest();
                }

                // Second pass: ingest PR, Issue, Commit nodes linked to their Repo.
                for (const entity of entities) {
                  if (entity.type === 'CodeChange') {
                    const repoId = entity.repoRef ? repoIdMap.get(entity.repoRef) : undefined;
                    await ingestGitHubEntity('PR', {
                      id: entity.id,
                      number: entity.raw?.number,
                      title: entity.title,
                      pr_text_content: entity.title + (entity.body ? '\n' + entity.body : ''),
                      pr_description: entity.body ?? '',
                      url: entity.url,
                    }, { kbId, userId: user.uid, repoId });
                    bumpIngest();
                  } else if (entity.type === 'WorkItem') {
                    const repoId = entity.repoRef ? repoIdMap.get(entity.repoRef) : undefined;
                    await ingestGitHubEntity('Issue', {
                      id: entity.id,
                      number: entity.raw?.number,
                      title: entity.title,
                      issue_text_content: entity.title + (entity.body ? '\n' + entity.body : ''),
                      url: entity.url,
                    }, { kbId, userId: user.uid, repoId });
                    bumpIngest();
                  } else if (entity.type === 'Commit') {
                    const repoId = entity.repoRef ? repoIdMap.get(entity.repoRef) : undefined;
                    await ingestGitHubEntity('Commit', {
                      id: entity.id,
                      sha: entity.raw?.sha ?? entity.externalId ?? entity.id,
                      commit_text_content: entity.body || entity.title,
                      url: entity.url,
                    }, { kbId, userId: user.uid, repoId });
                    bumpIngest();
                  }
                }

                // Ingest rich documents into Cognee AND persist a summary entry
                // into the KB's MongoDB documents array so the direct-retrieval
                // fallback in app-chat can surface GitHub content even before
                // Cognee finishes indexing.
                const mongoDocEntries: any[] = [];
                for (const doc of documents) {
                  const header = `# Knowledge Base ID: ${kbId}\n# Repo: ${doc.title} [${doc.kind}]\n\n`;
                  await cogneeIngest(header + doc.content, opts);
                  bumpIngest();
                  mongoDocEntries.push({
                    id: newId(),
                    name: doc.title,
                    type: `github-${doc.kind}`,
                    size: doc.content.length,
                    preview: doc.content.slice(0, 240),
                    content: doc.content.slice(0, 100_000),
                    status: 'ready',
                    createdAt: now,
                  });
                }
                if (mongoDocEntries.length > 0) {
                  await kbCol.updateOne(
                    { _id: kbId, userId: user.uid },
                    { $push: { documents: { $each: mongoDocEntries } }, $set: { updatedAt: now } }
                  );
                }

                console.log(`[KB ${kbId}] GitHub ingestion complete.`);
                ingestProgress.set(kbId, { phase: 'Complete', pct: 100, done: true, startedAt: Date.now() });
                // Auto-clean after 10 min so the map doesn't grow forever.
                setTimeout(() => ingestProgress.delete(kbId), 10 * 60 * 1000);
              } catch (err: any) {
                console.error(`[KB ${kbId}] GitHub deepSnapshot failed:`, err.message);
                ingestProgress.set(kbId, { phase: `Failed: ${err.message}`, pct: 0, done: true, error: err.message, startedAt: Date.now() });
                setTimeout(() => ingestProgress.delete(kbId), 10 * 60 * 1000);
              }
            })();
          }
        }
        return res.status(200).json({ success: true, source });
      }

      // ── Detach a source from this KB and rebuild its graph ───────────────
      if (action === 'detach-source') {
        const { kbId, platform } = body;
        if (!kbId || !platform) return res.status(400).json({ error: 'kbId and platform are required' });
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $pull: { sources: { platform } }, $set: { updatedAt: now } }
        );
        // Force a graph rebuild so the removed source's nodes drop out on their own.
        cognify(user.uid, { force: true, kbId }).catch(() => {});
        return res.status(200).json({ success: true });
      }

      // ── Remove a platform from EVERY KB (called when a connector is
      //    disconnected globally) so the per-KB graphs rebuild automatically. ─
      if (action === 'purge-source') {
        const { platform } = body;
        if (!platform) return res.status(400).json({ error: 'platform is required' });
        await kbCol.updateMany(
          { userId: user.uid },
          { $pull: { sources: { platform } }, $set: { updatedAt: now } }
        );
        cognify(user.uid, { force: true }).catch(() => {});
        return res.status(200).json({ success: true });
      }

      if (action === 'rename') {
        const { kbId, name, description } = body;
        if (!kbId) return res.status(400).json({ error: 'kbId is required' });
        const fields: Record<string, any> = { updatedAt: now };
        if (typeof name === 'string' && name.trim()) fields.name = name.trim();
        if (typeof description === 'string') fields.description = description.trim();
        await kbCol.updateOne({ _id: kbId, userId: user.uid }, { $set: fields });
        return res.status(200).json({ success: true });
      }

      // ── Manually trigger a graph rebuild for a KB ────────────────────────
      if (action === 'rebuild-graph') {
        const { kbId } = body;
        if (!kbId) return res.status(400).json({ error: 'kbId is required' });
        cognify(user.uid, { force: true, kbId }).catch(() => {});
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Knowledge base ID is required' });
      await kbCol.deleteOne({ _id: id, userId: user.uid });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/kb:', error.message);
    return res
      .status(error.message.includes('Authorization') ? 418 : 500)
      .json({ error: error.message || 'Authentication failed' });
  }
}
