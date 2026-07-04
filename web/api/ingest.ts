// UPDATED: added additive node-graph pipeline (Source/Chunk/Entity + NER) persisted to kb_nodes/kb_edges, invoked best-effort after the existing persistAndIngest() call in runInitialSync — existing sync flow untouched.
import { getDb } from './mongodb.js';
import { addText, cognify } from './cognee.js';
import { entitiesToDocument, normalizeExtractedEntity } from './lib/schema.js';
import { embedBatch } from './lib/embeddings.js';
import { buildNodeGraphEdges } from './lib/graphbuild.js';
import {
  getConnection,
  getAccessToken,
  setSyncState,
  updateConnection,
} from './connections.js';
import * as github from './lib/github.js';
import * as jira from './lib/jira.js';
import * as google from './lib/google.js';

// UI connector → the OAuth provider whose stored connection holds its token.
const GOOGLE_CONNECTORS = ['gdocs', 'gslides', 'gsheets', 'gcal'];
function oauthProviderFor(provider) {
  return GOOGLE_CONNECTORS.includes(provider) ? 'google' : provider;
}

/**
 * Ingestion orchestrator.
 *
 * Adapts stages 3 (Initial Snapshot) and 4 (Ongoing Ingestion) of the
 * architecture to the Express/Mongo/Cognee stack:
 *
 *   provider API  ──►  normalize (lib/schema)  ──►  upsert kb_entities (Mongo)
 *                                                ╰─►  remember() into Cognee KG
 *
 * Mongo `kb_entities` is the durable, queryable archive (our "S3 + normalised
 * store"); Cognee is the graph/retrieval layer the chat endpoint recalls from.
 */

const COGNEE_BATCH = 25;

/** Upsert normalised entities into Mongo, isolated per user. */
async function upsertEntities(userId, entities) {
  if (!entities.length) return 0;
  const db = await getDb();
  const kb = db.collection('kb_entities');
  const now = new Date().toISOString();
  for (const e of entities) {
    await kb.updateOne(
      { _id: `${userId}::${e.id}` },
      { $set: { ...e, entityId: e.id, userId, ingestedAt: now } },
      { upsert: true }
    );
  }
  return entities.length;
}

/**
 * Stage normalised entities into Cognee, then trigger cognify so the LLM
 * extracts entities + relationships into the actual knowledge graph
 * (GraphRAG). `force` rebuilds immediately (initial snapshot); delta syncs
 * use the debounced rebuild to avoid hammering the extractor.
 */
async function ingestToCognee(userId, provider, entities, force) {
  for (let i = 0; i < entities.length; i += COGNEE_BATCH) {
    const batch = entities.slice(i, i + COGNEE_BATCH);
    const doc = entitiesToDocument(batch, `${provider} knowledge`);
    await addText(doc, { userId, nodeSet: [provider] });
  }
  if (entities.length) await cognify(userId, { force });
}

async function persistAndIngest(userId, provider, entities, force = false) {
  const count = await upsertEntities(userId, entities);
  // Non-blocking into Cognee — extraction is async on their side anyway.
  ingestToCognee(userId, provider, entities, force).catch((e) =>
    console.warn('Cognee ingest (non-fatal):', e.message)
  );
  return count;
}

// ── Initial snapshot ─────────────────────────────────────────────────────────

/**
 * Full historical pull for a freshly connected provider.
 * @param selectedItems  picked in the UI: GitHub repo objects {name:"owner/repo"}
 *                        (Jira pulls all accessible projects regardless).
 */
export async function runInitialSync(userId, provider, selectedItems = [], nodeGraphSince?) {
  const op = oauthProviderFor(provider); // connection + sync state live under the OAuth provider
  const connection = await getConnection(userId, op);
  if (!connection) throw new Error(`No ${op} connection for user`);

  await setSyncState(userId, op, { initialSyncStatus: 'in_progress', error: null });

  try {
    const token = await getAccessToken(connection);
    let entities = [];

    if (provider === 'github') {
      const repos = selectedItems.map((i) => i.name).filter(Boolean);
      // Remember the selection so delta sync knows what to poll.
      await updateConnection(userId, op, { selectedRepos: repos });
      ({ entities } = await github.snapshot(token, repos));
    } else if (provider === 'jira') {
      ({ entities } = await jira.snapshot({
        token,
        cloudId: connection.cloudId,
        siteUrl: connection.siteUrl,
      }));
    } else if (GOOGLE_CONNECTORS.includes(provider)) {
      ({ entities } = await google.snapshot(token, selectedItems, provider));
    } else {
      throw new Error(`Ingestion not implemented for provider: ${provider}`);
    }

    const count = await persistAndIngest(userId, provider, entities, true);

    if (['gdocs', 'gslides', 'jira', 'gcal'].includes(provider)) {
      // Additive node-graph scaffolding (Source/Chunk/Entity) — best-effort,
      // never blocks or fails the real sync. This is the global connect path, so
      // kbId is the userId stand-in; real per-KB scoping flows through kb.ts's
      // attach-source, which calls buildNodeGraphForProvider with a real kbId.
      // nodeGraphSince (set by "Sync now" refreshes) makes this an incremental
      // build; unset on a true initial sync → full build.
      buildNodeGraphForProvider(userId, userId, provider, selectedItems, token, connection, nodeGraphSince).catch((e) =>
        console.warn(`Node-graph build failed for ${provider} (non-fatal):`, e.message)
      );
    }

    await setSyncState(userId, op, {
      initialSyncStatus: 'completed',
      lastSyncAt: new Date().toISOString(),
      lastPollCursor: new Date().toISOString(),
      entityCount: count,
    });
    return { count };
  } catch (e) {
    await setSyncState(userId, op, { initialSyncStatus: 'error', error: e.message });
    throw e;
  }
}

// ── Delta sync (polling safety net / hourly update) ──────────────────────────

export async function runDeltaSync(userId, provider) {
  const connection = await getConnection(userId, provider);
  if (!connection || connection.status !== 'active') return { skipped: true };
  if (connection.initialSyncStatus !== 'completed') return { skipped: true };

  const since = connection.lastPollCursor;
  const token = await getAccessToken(connection);
  let entities = [];

  if (provider === 'github') {
    const repos = connection.selectedRepos || [];
    if (!repos.length) return { skipped: true };
    ({ entities } = await github.pollSince(token, repos, since));
  } else if (provider === 'jira') {
    ({ entities } = await jira.pollSince(
      { token, cloudId: connection.cloudId, siteUrl: connection.siteUrl },
      since
    ));
    // Additive node-graph delta — best-effort, keyed by the userId stand-in and
    // scoped to issues updated since the cursor. Never blocks the real sync.
    buildNodeGraphForProvider(userId, userId, 'jira', [], token, connection, since).catch((e) =>
      console.warn('Node-graph delta failed for jira (non-fatal):', e.message)
    );
  }

  const count = await persistAndIngest(userId, provider, entities);
  await setSyncState(userId, provider, {
    lastSyncAt: new Date().toISOString(),
    lastPollCursor: new Date().toISOString(),
  });
  return { count };
}

/**
 * Push every existing Mongo entity for a user into their Cognee dataset and
 * rebuild the graph. Decouples the semantic graph from provider re-fetch, so
 * the Cognee-extracted view populates even for already-ingested data.
 */
export async function rehydrateCognee(userId) {
  const db = await getDb();
  const ents = await db.collection('kb_entities').find({ userId }).limit(600).toArray();
  if (!ents.length) return { staged: 0 };
  for (let i = 0; i < ents.length; i += COGNEE_BATCH) {
    const batch = ents.slice(i, i + COGNEE_BATCH);
    await addText(entitiesToDocument(batch, 'enterprise knowledge graph'), { userId, nodeSet: ['rehydrate'] });
  }
  await cognify(userId, { force: true });
  return { staged: ents.length };
}

/**
 * Manual "Sync now" for one user — refresh every active connection immediately.
 * GitHub/Jira run a delta poll; Google re-ingests the items the user selected
 * (Drive export has no cheap delta, so we re-pull the chosen files/events).
 */
export async function syncUser(userId) {
  const db = await getDb();
  const conns = await db.collection('integration_connections').find({ userId, status: 'active' }).toArray();
  let total = 0;
  for (const conn of conns) {
    try {
      if (conn.provider === 'google') {
        const cdoc = await db.collection('connectors').findOne({ userId });
        const cmap = cdoc?.connectors || {};
        // Old pipeline re-pulls fully (Drive has no cheap delta), but the
        // node-graph build reuses the poll cursor so docs/slides (modifiedTime)
        // and calendar (updatedMin) only re-ingest what changed.
        const nodeGraphSince = conn.lastPollCursor;
        for (const plat of ['gdocs', 'gslides', 'gsheets', 'gcal']) {
          const items = cmap[plat]?.selectedItems || [];
          if (items.length) {
            const r = await runInitialSync(userId, plat, items, nodeGraphSince);
            total += r.count || 0;
          }
        }
      } else if (conn.provider === 'github') {
        // Full re-snapshot so a just-pushed repo's status/commits are current.
        const repos = (conn.selectedRepos || []).map((name) => ({ name }));
        if (repos.length) {
          const r = await runInitialSync(userId, 'github', repos);
          total += r.count || 0;
        } else {
          const r = await runDeltaSync(userId, conn.provider);
          total += r.count || 0;
        }
      } else if (conn.provider === 'jira') {
        const r = await runInitialSync(userId, 'jira', []);
        total += r.count || 0;
      } else {
        const r = await runDeltaSync(userId, conn.provider);
        total += r.count || 0;
      }
    } catch (e) {
      console.warn(`Sync-now failed for ${conn.provider}/${userId.slice(0, 8)}:`, e.message);
    }
  }
  // Ensure the Cognee semantic graph reflects everything we have in Mongo.
  await rehydrateCognee(userId).catch((e) => console.warn('Rehydrate failed:', e.message));
  return { total, connections: conns.length };
}

/**
 * Periodic delta loop driver — the "every N minutes" scheduler from §7.
 * Polls every active, fully-synced connection whose last sync is older than the
 * configured interval.
 */
export async function syncAllDue(intervalMinutes = 30) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - intervalMinutes * 60 * 1000).toISOString();
  const due = await db
    .collection('integration_connections')
    .find({
      status: 'active',
      initialSyncStatus: 'completed',
      $or: [{ lastSyncAt: { $lt: cutoff } }, { lastSyncAt: { $exists: false } }],
    })
    .toArray();

  for (const conn of due) {
    try {
      const r = await runDeltaSync(conn.userId, conn.provider);
      if (r.count) console.log(`Delta sync ${conn.provider} (${conn.userId.slice(0, 8)}): +${r.count}`);
    } catch (e) {
      console.warn(`Delta sync failed for ${conn.provider}/${conn.userId.slice(0, 8)}:`, e.message);
    }
  }
  return { connections: due.length };
}

// ── Node-graph pipeline (permanent instant-retrieval cache) ─────────────────
//
// Parallel to the KBEntity/Cognee flow above — does not replace it. Cognee is
// the source of truth; this is a rebuildable, user-scoped CACHE that grounds
// chat instantly, before Cognee's async index catches up. Populates the
// KnowledgeBase -> Source -> Chunk -> Entity -> RELATES_TO -> Entity model for
// gdocs/gslides/jira/gcal into kb_nodes/kb_edges, read by retrieval.ts's
// retrieveNodeGraphContext (chat) and graph.ts's mode=nodes (visualisation).

// NOTE: the node graph no longer runs its own LLM NER. Cognee is the sole
// entity/relationship extractor (via cognify) so the two pipelines don't compete
// for Fireworks quota. The node graph keeps only structural nodes,
// content, embeddings, gcal's structured entities, and Jira linked-issue edges.

/** Populate .metadata.embedding on each EntityNode in one paced batch; never throws. */
async function embedEntityNodesBatch(entityNodes) {
  if (!entityNodes.length) return entityNodes;
  try {
    const embeds = await embedBatch(entityNodes.map((en) => `${en.metadata.name} ${en.metadata.description}`));
    entityNodes.forEach((en, i) => { en.metadata.embedding = embeds[i]; });
  } catch (e) {
    console.warn('Node-graph entity embedBatch failed (non-fatal):', e.message);
  }
  return entityNodes;
}

/** Keep the first node per id — entities dedupe by name→id, so this collapses cross-chunk repeats. */
function dedupeById(nodes) {
  const seen = new Map();
  for (const n of nodes) if (!seen.has(n.id)) seen.set(n.id, n);
  return [...seen.values()];
}

/**
 * Pairwise RELATES_TO links between entities extracted together from the
 * same NER call, mirroring cognee.ts's own established co-occurrence pattern
 * (entities found together in one chunk/PR/issue get linked to each other).
 */
function pairwiseCooccurrenceLinks(entityNodes, sourceTitle) {
  const links = [];
  for (let i = 0; i < entityNodes.length; i++) {
    for (let j = i + 1; j < entityNodes.length; j++) {
      links.push({
        fromEntityId: entityNodes[i].id,
        toEntityId: entityNodes[j].id,
        description: `co-occurs in ${sourceTitle}`,
      });
    }
  }
  return links;
}

/** Upsert node-graph nodes/edges into Mongo, mirroring upsertEntities()'s pattern. */
async function upsertNodeGraph(userId, kbId, nodes, edges) {
  if (!nodes.length && !edges.length) return { nodes: 0, edges: 0 };
  const db = await getDb();
  const nodesCol = db.collection('kb_nodes');
  const edgesCol = db.collection('kb_edges');
  const now = new Date().toISOString();
  for (const n of nodes) {
    await nodesCol.updateOne({ _id: n.id }, { $set: { ...n, kbId, userId, ingestedAt: now } }, { upsert: true });
  }
  for (const e of edges) {
    const edgeId = `${kbId}::${e.source}::${e.target}::${e.label}`;
    await edgesCol.updateOne({ _id: edgeId }, { $set: { ...e, kbId, userId, ingestedAt: now } }, { upsert: true });
  }
  return { nodes: nodes.length, edges: edges.length };
}

/**
 * Build and persist the new Source/Chunk/Entity graph for one platform batch.
 * Wrapped entirely in try/catch — a failure here never affects the real sync.
 *
 * `kbId` is the real Knowledge-Base id when invoked from kb.ts's attach-source,
 * or the `userId` stand-in for the global connect/delta paths.
 * `since` (ISO string) turns this into a delta build: only sources changed after
 * the cursor are re-ingested. Note: delta upserts add/update nodes but never
 * delete stale ones (no tombstoning) — same trade-off the live pipeline accepts.
 */
export async function buildNodeGraphForProvider(userId, kbId, provider, selectedItems, token, connection, since?) {
  try {
    let sources = [];
    let children = [];
    // One entry per (source-node, entity) occurrence — drives HAS_ENTITY edges.
    // Deduped by id later for the node list + embedding (an entity in N chunks
    // is one node, but keeps N edges).
    const entityOccurrences = [];
    const entityLinks = [];

    // Structured (non-LLM) entities only — used by gcal (attendees/location).
    // The node graph no longer runs its own LLM NER: Cognee is the sole entity
    // extractor, so this stays a lightweight structural + content cache and does
    // not compete with cognify for Groq quota. Content retrieval still works off
    // the Source/Chunk nodes below.
    const addEntities = (rawEntities, sourceNodeId, sourceTitle) => {
      if (!rawEntities.length) return;
      const entityNodes = rawEntities.map((e) => normalizeExtractedEntity(e, kbId, sourceNodeId));
      entityOccurrences.push(...entityNodes);
      entityLinks.push(...pairwiseCooccurrenceLinks(entityNodes, sourceTitle));
    };

    if (provider === 'gdocs') {
      const { documents, chunks } = await google.gdocsNodeSnapshot(token, selectedItems, kbId, since);
      sources = documents;
      children = chunks;
    } else if (provider === 'gslides') {
      const { presentations, slides } = await google.gslidesNodeSnapshot(token, selectedItems, kbId, since);
      sources = presentations;
      children = slides;
    } else if (provider === 'jira') {
      const { projects, issues } = await jira.jiraNodeSnapshot(
        { token, cloudId: connection?.cloudId, siteUrl: connection?.siteUrl },
        kbId,
        since
      );
      sources = projects;
      children = issues;
      // Jira linked_issues -> RELATES_TO between IssueNodes (spec's edge rule 3).
      const keyToNodeId = new Map(issues.map((i) => [i.metadata.issue_key, i.id]));
      for (const issue of issues) {
        for (const link of issue.metadata.linked_issues || []) {
          const targetId = keyToNodeId.get(link.key);
          if (targetId) entityLinks.push({ fromEntityId: issue.id, toEntityId: targetId, description: link.relationship });
        }
      }
    } else if (provider === 'gcal') {
      const { calendar, events, structuredEntities } = await google.gcalNodeSnapshot(token, selectedItems, kbId, since);
      sources = [calendar];
      children = events;
      // Structured, no NER — attendees/location become Entity nodes directly (spec's edge rule 4).
      const candidatesByEvent = new Map(structuredEntities.map((s) => [s.eventId, s.candidates]));
      for (const event of events) {
        addEntities(candidatesByEvent.get(event.id) || [], event.id, calendar.title);
      }
    } else {
      return;
    }

    // Dedupe entity nodes by id and embed the unique set once (an entity in N
    // chunks is one node + one embed call, but keeps its N HAS_ENTITY edges).
    const uniqueEntities = await embedEntityNodesBatch(dedupeById(entityOccurrences));

    const kbRoot = { id: `kb:${kbId}`, type: 'knowledge_base', title: kbId, body: '', metadata: { kb_id: kbId } };
    // Edges use every occurrence (for per-chunk HAS_ENTITY); nodes use uniques.
    const { edges } = buildNodeGraphEdges({ kbId, sources, children, entities: entityOccurrences, entityLinks });
    const nodes = [kbRoot, ...sources, ...children, ...uniqueEntities];
    await upsertNodeGraph(userId, kbId, nodes, edges);
  } catch (e) {
    console.warn(`Node-graph build failed for ${provider} (non-fatal):`, e.message);
  }
}
