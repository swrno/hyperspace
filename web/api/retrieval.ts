import { getDb } from './mongodb.js';
import { entityToText, sourceLabel } from './lib/schema.js';

/**
 * Local (Mongo) retrieval for chat grounding.
 *
 * Cognee is the long-term graph, but it isn't user-scoped and indexes
 * asynchronously, so a freshly connected repo isn't answerable for a while.
 * This module grounds answers directly from the per-user `kb_entities` the
 * ingestion pipeline already wrote — instantly and isolated per user.
 *
 * It always returns a compact snapshot of the user's graph (repos, type
 * breakdown, most-recent items) plus any keyword matches, so vague questions
 * like "what's the condition of the repo now" still get real context.
 */

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'what', 'which', 'with', 'this', 'that', 'now',
  'how', 'why', 'who', 'when', 'where', 'have', 'has', 'does', 'did', 'can', 'about',
  'into', 'from', 'your', 'you', 'our', 'all', 'any', 'get', 'got', 'its', 'is', 'of',
  'in', 'on', 'to', 'a', 'an', 'me', 'my', 'it',
]);

function tokenize(query) {
  return [...new Set(
    String(query || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )];
}

function entityText(e) {
  // Include the human source label + type so queries like "sheets status" or
  // "my repos" match the right entities even when the word isn't in the title.
  return `${sourceLabel(e.source)} ${e.source || ''} ${e.type || ''} ${e.title || ''} ${e.body || ''} ${e.repoRef || ''} ${e.externalKey || ''} ${e.projectRef || ''} ${(e.labels || []).join(' ')}`.toLowerCase();
}

function score(e, tokens) {
  const hay = entityText(e);
  const title = (e.title || '').toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (hay.includes(t)) s += 1;
    if (title.includes(t)) s += 2; // title hits weigh more
  }
  return s;
}

function countBy(rows, keyFn) {
  const c: Record<string, number> = {};
  for (const r of rows) { const k = keyFn(r); c[k] = (c[k] || 0) + 1; }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ');
}

/**
 * Build grounded context for a chat message. Returns a string or null.
 */
export async function retrieveContext(userId, query, { entityLimit = 16, docLimit = 3 } = {}) {
  const db = await getDb();
  const kb = db.collection('kb_entities');

  // Bounded recent window — most relevant for "current state" questions.
  const all = await kb.find({ userId }).sort({ updatedAt: -1 }).limit(300).toArray();

  const tokens = tokenize(query);

  // Priority-merge so the substantive, user-authored content always reaches the
  // model. Commits are high-volume but low-signal, so they fill last.
  //   1. keyword matches (best signal)
  //   2. all document-like nodes (Docs / Sheets / Slides / Emails / Events)
  //   3. recent work items, PRs, projects, repos
  //   4. anything else (commits)
  const CONTENT_TYPES = ['Document', 'Message', 'Event'];
  const matched = tokens.length
    ? all.map((e) => ({ e, s: score(e, tokens) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.e)
    : [];
  const contentNodes = all.filter((e) => CONTENT_TYPES.includes(e.type));
  const recentSignal = all.filter((e) => e.type !== 'Commit' && !CONTENT_TYPES.includes(e.type));

  const seen = new Set();
  const picked = [];
  for (const e of [...matched, ...contentNodes, ...recentSignal, ...all]) {
    const key = e.id || e._id;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(e);
    if (picked.length >= entityLimit) break;
  }

  // Matching knowledge-base documents.
  let docBlocks = [];
  try {
    const kbs = await db.collection('knowledge_bases').find({ userId }).toArray();
    const docs = kbs.flatMap((k) => (k.documents || []).map((d) => ({ ...d, kb: k.name })));
    const ranked = tokens.length
      ? docs
          .map((d) => {
            const hay = `${d.name} ${d.content || ''}`.toLowerCase();
            return { d, s: tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
          })
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, docLimit)
          .map((x) => x.d)
      : [];
    docBlocks = ranked.map((d) => `[Document] ${d.name} (KB: ${d.kb})\n${(d.content || '').slice(0, 1500)}`);
  } catch {
    /* ignore */
  }

  if (!all.length && !docBlocks.length) return null;

  const repos = all.filter((e) => e.type === 'Repository').map((e) => e.title);
  const lines = [];
  if (all.length) {
    lines.push(`The user's knowledge graph holds ${all.length} nodes.`);
    lines.push(`By source: ${countBy(all, (e) => sourceLabel(e.source))}.`);
    lines.push(`By type: ${countBy(all, (e) => e.type)}.`);
    if (repos.length) lines.push(`Repositories: ${repos.slice(0, 25).join(', ')}.`);
    lines.push('');
    lines.push('Most relevant items:');
    lines.push(picked.map(entityToText).join('\n\n---\n\n'));
  }
  if (docBlocks.length) {
    lines.push('');
    lines.push('Relevant documents:');
    lines.push(docBlocks.join('\n\n---\n\n'));
  }
  return lines.join('\n');
}

// Content-bearing node types in the additive Source/Chunk/Entity graph — the
// ones worth surfacing to the model (entities are attached as related items).
const NODE_CONTENT_TYPES = ['document', 'chunk', 'slide', 'presentation', 'jira_project', 'jira_issue', 'calendar_event'];

function nodeText(n) {
  const m = n.metadata || {};
  return `${n.title || ''} ${n.body || ''} ${m.name || ''} ${m.description || ''} ${m.issue_text_content || ''} ${m.chunk_text_content || ''} ${m.slide_text_content || ''}`.toLowerCase();
}

function scoreNode(n, tokens) {
  const hay = nodeText(n);
  const title = (n.title || '').toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (hay.includes(t)) s += 1;
    if (title.includes(t)) s += 2; // title hits weigh more
  }
  return s;
}

/**
 * Grounding context from the additive node graph (`kb_nodes`/`kb_edges`).
 *
 * Complements retrieveContext (the flat kb_entities index) with the richer
 * Source -> Chunk -> Entity structure: keyword-matched content nodes plus their
 * 1-hop entities/relations. Scoped by userId, and by real `kbId` when a chat is
 * pinned to a knowledge base. Returns a formatted string or null.
 */
export async function retrieveNodeGraphContext(userId, query, { kbId }: { kbId?: string } = {}) {
  const db = await getDb();
  const filter: Record<string, any> = { userId };
  if (kbId) filter.kbId = kbId;

  const nodes = await db.collection('kb_nodes').find(filter).limit(400).toArray();
  if (!nodes.length) return null;

  const byId = new Map(nodes.map((n) => [n.id || n._id, n]));
  const tokens = tokenize(query);

  const content = nodes.filter((n) => NODE_CONTENT_TYPES.includes(n.type));
  const ranked = tokens.length
    ? content.map((n) => ({ n, s: scoreNode(n, tokens) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.n)
    : content;
  const picked = ranked.slice(0, 12);
  if (!picked.length) return null;

  // 1-hop neighbours: entities (HAS_ENTITY) and relations (RELATES_TO) of the
  // picked nodes, resolved to titles via the in-memory node map.
  const pickedIds = picked.map((n) => n.id || n._id);
  const edges = await db
    .collection('kb_edges')
    .find({ ...filter, source: { $in: pickedIds }, label: { $in: ['HAS_ENTITY', 'RELATES_TO'] } })
    .limit(600)
    .toArray();
  const relatedBySource = new Map<string, string[]>();
  for (const e of edges) {
    const target = byId.get(e.target) as any;
    const label = target?.title || e.target;
    if (!label) continue;
    const arr = relatedBySource.get(e.source) || [];
    if (!arr.includes(label)) arr.push(label);
    relatedBySource.set(e.source, arr);
  }

  const blocks = picked.map((n) => {
    const body = (n.body || n.metadata?.description || '').slice(0, 400);
    const related = (relatedBySource.get(n.id || n._id) || []).slice(0, 12);
    const relLine = related.length ? `\nRelated: ${related.join(', ')}` : '';
    return `[${n.type}] ${n.title || n.id}${body ? `\n${body}` : ''}${relLine}`;
  });

  return `The node graph holds ${nodes.length} nodes. Most relevant:\n${blocks.join('\n\n---\n\n')}`;
}
