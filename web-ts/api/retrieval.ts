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
