import { getDb } from './mongodb.js';
import { addText, cognify } from './cognee.js';
import { entitiesToDocument } from './lib/schema.js';
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
export async function runInitialSync(userId, provider, selectedItems = []) {
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
        for (const plat of ['gdocs', 'gslides', 'gsheets', 'gcal']) {
          const items = cmap[plat]?.selectedItems || [];
          if (items.length) {
            const r = await runInitialSync(userId, plat, items);
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
