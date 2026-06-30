import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { listConnections } from './connections.js';
import { buildStructuralGraph } from './lib/graphbuild.js';

/**
 * Dashboard stats — real aggregates over the user's ingested knowledge graph.
 *
 * GET /api/stats →
 *   {
 *     total, documents, knowledgeBases,
 *     byType:   [{ key, n }],   // WorkItem / CodeChange / Commit / Sprint / …
 *     bySource: [{ key, n }],   // github / jira / …
 *     byStatus: [{ key, n }],   // WorkItem status distribution
 *     timeline: [{ date, n }],  // entities ingested per day (last 14d, filled)
 *     recent:   [{ id, type, source, title, status, url, updatedAt }],
 *     connections: [{ provider, status, initialSyncStatus, entityCount, lastSyncAt, account, site }]
 *   }
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);
    const userId = user.uid;
    const db = await getDb();
    const kb = db.collection('kb_entities');

    const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString();

    const [byType, bySource, byStatus, timelineRaw, recent, connections, kbs, allEnts] = await Promise.all([
      kb.aggregate([{ $match: { userId } }, { $group: { _id: '$type', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
      kb.aggregate([{ $match: { userId } }, { $group: { _id: '$source', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
      kb.aggregate([{ $match: { userId, type: 'WorkItem' } }, { $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
      kb.aggregate([
        { $match: { userId, ingestedAt: { $gte: since } } },
        { $group: { _id: { $substr: ['$ingestedAt', 0, 10] }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      kb.find({ userId }).sort({ updatedAt: -1 }).limit(8).toArray(),
      listConnections(userId),
      db.collection('knowledge_bases').find({ userId }).toArray(),
      kb.find({ userId }).limit(600).toArray(), // for graph node/edge counts (match /api/graph)
    ]);

    const map = (rows) => rows.map((r) => ({ key: r._id || 'unknown', n: r.n }));
    const total = byType.reduce((s, r) => s + r.n, 0);
    const documents = kbs.reduce((s, k) => s + (k.documents?.length || 0), 0);
    // Same builder as /api/graph → dashboard counts match the graph view exactly.
    const graph = buildStructuralGraph(allEnts).stats;

    // Fill the 14-day timeline so the chart has a continuous x-axis.
    const counts = Object.fromEntries(timelineRaw.map((r) => [r._id, r.n]));
    const timeline = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      timeline.push({ date: d, n: counts[d] || 0 });
    }

    return res.status(200).json({
      total,
      graph, // { nodes, edges, entities, sources, people } — matches /api/graph
      documents,
      knowledgeBases: kbs.length,
      byType: map(byType),
      bySource: map(bySource),
      byStatus: map(byStatus),
      timeline,
      recent: recent.map((e) => ({
        id: e.entityId || e._id,
        type: e.type,
        source: e.source,
        title: e.externalKey ? `${e.externalKey} · ${e.title}` : e.title,
        status: e.status,
        url: e.url,
        repoRef: e.repoRef,
        projectRef: e.projectRef,
        updatedAt: e.updatedAt || e.ingestedAt,
      })),
      connections: connections.map((c) => ({
        provider: c.provider,
        status: c.status,
        initialSyncStatus: c.initialSyncStatus,
        entityCount: c.entityCount || 0,
        lastSyncAt: c.lastSyncAt || null,
        account: c.providerUsername,
        site: c.siteName || null,
      })),
    });
  } catch (error) {
    console.error('Error in /api/stats:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Failed to load stats' });
  }
}
