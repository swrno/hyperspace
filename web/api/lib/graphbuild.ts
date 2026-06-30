import { sourceLabel } from './schema.js';

/** Human label + node type per connector platform, for the per-KB graph. */
const PLATFORM_LABEL: Record<string, string> = {
  github: 'GitHub', gdocs: 'Google Docs', gslides: 'Google Slides', gsheets: 'Google Sheets',
  gcal: 'Google Calendar', jira: 'Jira', slack: 'Slack', salesforce: 'Salesforce',
};
const PLATFORM_ITEM_TYPE: Record<string, string> = {
  github: 'Repository', gdocs: 'Document', gslides: 'Slide', gsheets: 'Spreadsheet',
  gcal: 'Event', jira: 'Project', slack: 'Channel', salesforce: 'Account',
};

/**
 * Build a knowledge graph scoped to a single knowledge base — its own documents
 * and the sources attached to it. This is what the per-KB Graph + Mindmap views
 * render, so the graph is always "based on sources" and rebuilds whenever a
 * source is attached or detached.
 *
 *   KnowledgeBase --CONTAINS--> Documents hub --HAS_DOC--> each Document
 *   KnowledgeBase --CONNECTED--> Source hub  --CONTAINS--> each item (repo/doc/…)
 */
export function buildKbGraph(kb: any) {
  const nodes: any[] = [];
  const ids = new Set<string>();
  const addNode = (n: any) => { if (!ids.has(n.id)) { ids.add(n.id); nodes.push(n); } };
  const edges: any[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, label: string) => {
    if (!ids.has(source) || !ids.has(target) || source === target) return;
    const k = `${source}|${target}|${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ source, target, label });
  };

  const rootId = `kb:${kb._id || kb.id}`;
  addNode({ id: rootId, label: kb.name || 'Knowledge Base', type: 'KnowledgeBase', source: 'kb' });

  const docs = kb.documents || [];
  if (docs.length) {
    const hub = 'kbsrc:documents';
    addNode({ id: hub, label: 'Documents', type: 'Source', source: 'documents', hub: true });
    addEdge(rootId, hub, 'CONTAINS');
    for (const d of docs) {
      const nid = `kbdoc:${d.id}`;
      addNode({ id: nid, label: d.name || 'Document', type: 'Document', source: 'documents', status: d.status });
      addEdge(hub, nid, 'HAS_DOC');
    }
  }

  for (const s of kb.sources || []) {
    const hub = `kbsrc:${s.platform}`;
    addNode({ id: hub, label: PLATFORM_LABEL[s.platform] || s.platform, type: 'Source', source: s.platform, hub: true });
    addEdge(rootId, hub, 'CONNECTED');
    const itype = PLATFORM_ITEM_TYPE[s.platform] || 'Entity';
    for (const it of s.items || []) {
      const nid = `kbitem:${s.platform}:${it.id}`;
      addNode({ id: nid, label: it.name || it.id, type: itype, source: s.platform, url: it.url });
      addEdge(hub, nid, 'CONTAINS');
    }
  }

  const degree: Record<string, number> = {};
  for (const e of edges) { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; }
  for (const n of nodes) n.degree = degree[n.id] || 0;

  return {
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      entities: nodes.length,
      sources: (kb.sources || []).length + (docs.length ? 1 : 0),
      people: 0,
    },
  };
}

/**
 * Build the structural knowledge graph (nodes + edges) from normalised entities,
 * following the README data model. Shared by /api/graph (visualisation) and
 * /api/stats (dashboard) so their node/edge counts always agree.
 */
export function buildStructuralGraph(ents) {
  const nodes = [];
  const ids = new Set();
  const addNode = (n) => { if (!ids.has(n.id)) { ids.add(n.id); nodes.push(n); } };
  const edges = [];
  const seenEdge = new Set();
  const addEdge = (source, target, label) => {
    if (!ids.has(source) || !ids.has(target) || source === target) return;
    const k = `${source}|${target}|${label}`;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ source, target, label });
  };

  // 1. Entity nodes
  for (const e of ents) {
    addNode({ id: e.id, label: e.externalKey || e.title || e.type, type: e.type, source: e.source, status: e.status, url: e.url });
  }

  // 2. Source hubs + CONTAINS spokes
  const sources = [...new Set(ents.map((e) => e.source))];
  for (const s of sources) addNode({ id: `src:${s}`, label: sourceLabel(s), type: 'Source', source: s, hub: true });
  for (const e of ents) addEdge(`src:${e.source}`, e.id, 'CONTAINS');

  // 3. Repository → its children (by repoRef)
  const repoByName = {};
  for (const e of ents) if (e.type === 'Repository') repoByName[e.title] = e.id;
  for (const e of ents) {
    if (e.type !== 'Repository' && e.repoRef && repoByName[e.repoRef]) {
      const label = e.type === 'Commit' ? 'HAS_COMMIT' : e.type === 'CodeChange' ? 'HAS_PR' : 'HAS_ISSUE';
      addEdge(repoByName[e.repoRef], e.id, label);
    }
  }

  // 4. Project → Jira work items (by projectRef)
  const projByKey = {};
  for (const e of ents) if (e.type === 'Project') projByKey[e.externalKey || e.projectRef] = e.id;
  for (const e of ents) {
    if (e.source === 'jira' && e.type === 'WorkItem' && e.projectRef && projByKey[e.projectRef]) {
      addEdge(projByKey[e.projectRef], e.id, 'HAS_ISSUE');
    }
  }

  // 5. Cross-source links via extracted keys → WorkItem
  const wiByKey = {};
  for (const e of ents) if (e.externalKey) wiByKey[e.externalKey] = e.id;
  for (const e of ents) {
    for (const k of e.linkedKeys || []) {
      if (wiByKey[k]) {
        const label = e.type === 'CodeChange' ? 'RESOLVES' : e.type === 'Document' ? 'MENTIONS' : 'REFERENCES';
        addEdge(e.id, wiByKey[k], label);
      }
    }
  }

  // 6. People (deduped) + AUTHORED_BY
  const people = new Set();
  for (const e of ents) {
    if (!e.authorRef) continue;
    const pid = `person:${e.authorRef}`;
    if (!people.has(pid)) { people.add(pid); addNode({ id: pid, label: e.authorRef, type: 'Person', source: 'people' }); }
    addEdge(e.id, pid, 'AUTHORED_BY');
  }

  // Degree for node sizing
  const degree = {};
  for (const e of edges) { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; }
  for (const n of nodes) n.degree = degree[n.id] || 0;

  return {
    nodes,
    edges,
    stats: { nodes: nodes.length, edges: edges.length, entities: ents.length, sources: sources.length, people: people.size },
  };
}
