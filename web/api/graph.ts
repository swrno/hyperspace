import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { getDatasetGraph } from './cognee.js';
import { buildStructuralGraph, buildKbGraph } from './lib/graphbuild.js';

// Clean Cognee's "Type_<uuid>" auto labels down to something readable.
function cleanLabel(n: any) {
  const raw = n.properties?.name || n.properties?.text?.split('\n')[0] || n.label || n.type || 'node';
  const m = /^(\w+)_[0-9a-f]{8}(-[0-9a-f]+)+$/i.exec(raw);
  return (m ? m[1] : raw).slice(0, 60);
}

/**
 * Cognee's /datasets/{id}/graph API frequently returns 0 edges even after
 * cognify has run. Derive structural edges from well-known property fields
 * so the visualisation shows a connected graph instead of isolated dots.
 *
 * Rules (in priority order):
 *   TextSummary.source_chunk_id  → SUMMARIZES  → DocumentChunk
 *   DocumentChunk.document_id    → PART_OF      → TextDocument
 *   *.belongs_to_set (labels)    → BELONGS_TO   → matching NodeSet node
 */
function deriveEdgesFromProperties(rawNodes: any[]): { source: string; target: string; label: string }[] {
  const edges: { source: string; target: string; label: string }[] = [];
  const nodeIds = new Set(rawNodes.map((n) => n.id));
  // NodeSet nodes indexed by their label so we can resolve belongs_to_set strings.
  const nodeSetByLabel = new Map<string, string>(
    rawNodes.filter((n) => n.type === 'NodeSet').map((n) => [n.label, n.id])
  );

  for (const n of rawNodes) {
    const p = n.properties || {};

    if (n.type === 'TextSummary' && p.source_chunk_id && nodeIds.has(p.source_chunk_id)) {
      edges.push({ source: n.id, target: p.source_chunk_id, label: 'SUMMARIZES' });
    }

    if (n.type === 'DocumentChunk' && p.document_id && nodeIds.has(p.document_id)) {
      edges.push({ source: n.id, target: p.document_id, label: 'PART_OF' });
    }

    const sets: string[] = Array.isArray(p.belongs_to_set) ? p.belongs_to_set : [];
    for (const setLabel of sets) {
      const setId = nodeSetByLabel.get(setLabel);
      if (setId && setId !== n.id) {
        edges.push({ source: n.id, target: setId, label: 'BELONGS_TO' });
      }
    }
  }

  return edges;
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

    // Per-KB graph → built purely from this knowledge base's own documents and
    // attached sources, so it's always "based on sources" and rebuilds when a
    // source is attached/detached. (Scoped, runs offline of Cognee.)
    const kbId = req.query?.kbId as string | undefined;

    // Semantic mode → the REAL graph Cognee extracted via cognify (entities +
    // relationships the LLM found), rather than our structural Mongo edges.
    if (req.query?.mode === 'cognee') {
      const g = await getDatasetGraph(user.uid, kbId);
      const rawNodes = g?.nodes || [];
      const rawEdges = g?.edges || [];
      const nodes = rawNodes.map((n: any) => ({ id: n.id, label: cleanLabel(n), type: n.type || 'Node', source: 'cognee', url: null, properties: n.properties || {} }));
      let edges = rawEdges
        .map((e: any) => ({ source: e.source ?? e.source_node_id, target: e.target ?? e.target_node_id, label: e.label || e.relationship_name || '' }))
        .filter((e: any) => e.source && e.target);

      // Cognee's /datasets/{id}/graph endpoint often returns 0 edges even when
      // relationships exist — synthesize them from well-known property fields.
      if (edges.length === 0 && rawNodes.length > 0) {
        edges = deriveEdgesFromProperties(rawNodes);
      }

      const degree: Record<string, number> = {};
      for (const e of edges) { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; }
      for (const n of nodes) n.degree = degree[n.id] || 0;
      const types = [...new Set(nodes.map((n) => n.type))];
      return res.status(200).json({ nodes, edges, mode: 'cognee', stats: { nodes: nodes.length, edges: edges.length, entities: nodes.length, sources: types.length, people: 0 } });
    }

    // Node-graph mode → the additive Source/Chunk/Entity scaffolding persisted
    // to the kb_nodes/kb_edges collections (gdocs/gslides/jira/gcal). Reachable
    // at GET /api/graph?mode=nodes&kbId=<userId>&platform=<optional>. Exposed as
    // a mode branch (not a separate /api/graph/nodes path) because server.ts
    // registers only app.all('/api/graph', …) and is off-limits to change.
    if (req.query?.mode === 'nodes') {
      const db = await getDb();
      const platform = req.query?.platform as string | undefined;
      const NODE_CAP = 2000;
      const EDGE_CAP = 5000;

      // Always scope by the authenticated user (kbId is the userId stand-in);
      // never trust a raw kbId query param to read another user's nodes.
      const nodeFilter: any = { userId: user.uid };
      if (kbId) nodeFilter.kbId = kbId;
      if (platform) nodeFilter['metadata.platform'] = platform;
      const edgeFilter: any = { userId: user.uid };
      if (kbId) edgeFilter.kbId = kbId;

      const rawNodes = await db.collection('kb_nodes').find(nodeFilter).limit(NODE_CAP + 1).toArray();
      const rawEdges = await db.collection('kb_edges').find(edgeFilter).limit(EDGE_CAP + 1).toArray();
      if (rawNodes.length > NODE_CAP) console.warn(`/api/graph?mode=nodes: nodes truncated at ${NODE_CAP}`);
      if (rawEdges.length > EDGE_CAP) console.warn(`/api/graph?mode=nodes: edges truncated at ${EDGE_CAP}`);

      // Drop internal fields (_id/userId/kbId/ingestedAt) and the large
      // embedding vectors — keep only what a viewer needs.
      const stripEmbedding = (meta: any) => {
        if (!meta || meta.embedding === undefined) return meta;
        const { embedding, ...rest } = meta;
        return rest;
      };
      const nodes = rawNodes.slice(0, NODE_CAP).map((n: any) => ({
        id: n.id, type: n.type, title: n.title, body: n.body, metadata: stripEmbedding(n.metadata),
      }));
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edges = rawEdges
        .slice(0, EDGE_CAP)
        .map((e: any) => ({
          source: e.source,
          target: e.target,
          label: e.label,
          ...(e.description ? { description: e.description } : {}),
        }))
        // Drop dangling edges whose endpoints fell outside the node cap.
        .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

      const byType: Record<string, number> = {};
      for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;

      return res.status(200).json({
        nodes,
        edges,
        stats: { nodeCount: nodes.length, edgeCount: edges.length, byType },
        mode: 'nodes',
      });
    }

    // Structural mode per-KB graph
    if (kbId) {
      const db = await getDb();
      const kb = await db.collection('knowledge_bases').findOne({ _id: kbId, userId: user.uid });
      if (!kb) return res.status(404).json({ error: 'Knowledge base not found' });
      const { nodes, edges, stats } = buildKbGraph(kb);
      return res.status(200).json({ nodes, edges, stats, kbId });
    }

    const db = await getDb();
    const ents = await db.collection('kb_entities').find({ userId: user.uid }).limit(600).toArray();
    const { nodes, edges, stats } = buildStructuralGraph(ents);
    return res.status(200).json({ nodes, edges, stats });
  } catch (err: any) {
    console.error('Error in /api/graph:', err.message);
    const status = String(err.message).includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: err.message || 'Failed to build graph' });
  }
}
