import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { getDatasetGraph } from './cognee.js';
import { buildStructuralGraph } from './lib/graphbuild.js';

// Clean Cognee's "Type_<uuid>" auto labels down to something readable.
function cleanLabel(n) {
  const raw = n.properties?.name || n.properties?.text?.split('\n')[0] || n.label || n.type || 'node';
  const m = /^(\w+)_[0-9a-f]{8}(-[0-9a-f]+)+$/i.exec(raw);
  return (m ? m[1] : raw).slice(0, 60);
}

/**
 * Knowledge-graph endpoint for visualisation.
 *
 * Turns the per-user `kb_entities` into an explicit node + edge graph following
 * the README's unified data model:
 *   - Source hubs  (GitHub / Jira / Google Docs …) --CONTAINS--> their entities
 *   - Repository --HAS_COMMIT / HAS_PR / HAS_ISSUE--> children (by repoRef)
 *   - Project    --HAS_ISSUE--> Jira work items (by projectRef)
 *   - CodeChange --RESOLVES--> WorkItem, Document --MENTIONS--> WorkItem,
 *     Commit --REFERENCES--> WorkItem   (cross-source, via extracted keys)
 *   - Entity --AUTHORED_BY--> Person    (deduped by author)
 *
 * GET /api/graph → { nodes:[{id,label,type,source,status,url,degree}], edges:[{source,target,label}], stats }
 */
export default async function handler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);

    // Semantic mode → the REAL graph Cognee extracted via cognify (entities +
    // relationships the LLM found), rather than our structural Mongo edges.
    if (req.query?.mode === 'cognee') {
      const g = await getDatasetGraph(user.uid);
      const rawNodes = g?.nodes || [];
      const rawEdges = g?.edges || [];
      const nodes = rawNodes.map((n) => ({ id: n.id, label: cleanLabel(n), type: n.type || 'Node', source: 'cognee', url: null }));
      const edges = rawEdges
        .map((e) => ({ source: e.source ?? e.source_node_id, target: e.target ?? e.target_node_id, label: e.label || e.relationship_name || '' }))
        .filter((e) => e.source && e.target);
      const degree = {};
      for (const e of edges) { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; }
      for (const n of nodes) n.degree = degree[n.id] || 0;
      const types = [...new Set(nodes.map((n) => n.type))];
      return res.status(200).json({ nodes, edges, mode: 'cognee', stats: { nodes: nodes.length, edges: edges.length, entities: nodes.length, sources: types.length, people: 0 } });
    }

    const db = await getDb();
    const ents = await db.collection('kb_entities').find({ userId: user.uid }).limit(600).toArray();
    const { nodes, edges, stats } = buildStructuralGraph(ents);
    return res.status(200).json({ nodes, edges, stats });
  } catch (error) {
    console.error('Error in /api/graph:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Failed to build graph' });
  }
}
