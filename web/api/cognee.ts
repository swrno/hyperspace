/**
 * Cognee Cloud client — the FULL GraphRAG pipeline, not just memory.
 *
 * Tenant: tenant-0610c5b7-…aws.cognee.ai   ·   Auth: X-API-Key
 *
 * Pipeline (README §5–6):
 *   add_text  →  cognify (LLM entity+relationship extraction → graph)  →  search
 *
 * We previously only called remember/recall (the short-term MEMORY layer), which
 * is flat vector storage. The real knowledge graph is built by `cognify`, then
 * queried with graph search types (GRAPH_COMPLETION does multi-hop reasoning).
 *
 *   addText(text, {userId, nodeSet})  - stage raw content into the user's dataset
 *   cognify(userId)                   - build/refresh the graph (debounced, async)
 *   graphSearch(query, {userId,...})  - multi-hop grounded retrieval
 *   getDatasetGraph(userId)           - the real extracted {nodes,edges}
 *   rememberMemory / recallMemory     - per-user personal memory (PSI, README §8)
 *
 * Data is isolated per user via dataset name `hypr_user_<uid>`.
 */

function cogneeBase() {
  return (process.env.COGNEE_BASE_URL || process.env.COGNEE_SERVICE_URL || '').replace(/\/$/, '');
}
function cogneeKey() {
  return process.env.COGNEE_API_KEY || '';
}
function configured() {
  if (!cogneeBase() || !cogneeKey()) {
    console.warn('Cognee not configured - COGNEE_BASE_URL / COGNEE_API_KEY missing');
    return false;
  }
  return true;
}

/** Per-user dataset name — user-level isolation. */
export function userDataset(userId) {
  return `hypr_user_${String(userId || 'anon').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}

/** Per-KB dataset name — KB-level multi-tenant isolation.
 *  Each knowledge base gets its own Cognee dataset so graphs are fully isolated. */
export function kbDataset(kbId) {
  return `hypr_kb_${String(kbId || 'unknown').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}

/** Resolve the correct dataset name: KB-scoped if kbId given, else user-scoped. */
function resolveDataset({ userId, kbId }: any = {}) {
  return kbId ? kbDataset(kbId) : userDataset(userId);
}

async function jpost(path, body) {
  const res = await fetch(`${cogneeBase()}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': cogneeKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

// Domain extraction guidance so cognify builds OUR enterprise schema
// (README §4 data model) and resolves identities across tools.
const ENTERPRISE_PROMPT =
  'Extract a cross-tool enterprise knowledge graph. Entity types: KnowledgeBase, Repository, ' +
  'PullRequest, Issue/WorkItem, Commit, Document, Spreadsheet, Slide, Sprint, ' +
  'Project, Person, Channel, Message, Account. Relationships: HAS_KB, HAS_REPO, HAS_PR, ' +
  'HAS_ISSUE, RESOLVES (PullRequest→Issue), AUTHORED_BY (→Person), MENTIONS ' +
  '(Document→Issue/PR), REFERENCES, DISCUSSION_IN, WORKS_ON. Every node should be connected to its KnowledgeBase node via HAS_KB if applicable. Resolve the same ' +
  'person and entity across GitHub, Jira, Google and Slack using email or name. ' +
  'Preserve identifiers exactly: repo full names, PR numbers, Jira keys like PROJ-123.';

// ── 1. Add ───────────────────────────────────────────────────────────────────

/** Stage text into a dataset (cheap). Uses KB-level dataset if kbId is provided. */
export async function addText(text, { userId, kbId, nodeSet }: any = {}) {
  if (!configured() || !text?.trim()) return null;
  try {
    const res = await jpost('/api/v1/add_text', {
      textData: [text],
      datasetName: resolveDataset({ userId, kbId }),
      ...(nodeSet ? { nodeSet: Array.isArray(nodeSet) ? nodeSet : [nodeSet] } : {}),
    });
    if (!res.ok) { console.warn('Cognee add_text failed', res.status, (await res.text()).slice(0, 160)); return null; }
    return (res.json() as any);
  } catch (e) { console.warn('Cognee add_text error:', e.message); return null; }
}

// ── 2. Cognify (build the graph) — debounced per user, runs in background ─────

const lastCognify = new Map(); // key -> timestamp
const COGNIFY_DEBOUNCE_MS = 90_000;

export async function cognify(userId, { force = false, kbId }: any = {}) {
  if (!configured()) return null;
  const key = kbId || userId;
  const last = lastCognify.get(key) || 0;
  if (!force && Date.now() - last < COGNIFY_DEBOUNCE_MS) return null; // avoid hammering the LLM
  lastCognify.set(key, Date.now());
  try {
    const res = await jpost('/api/v1/cognify', {
      datasets: [resolveDataset({ userId, kbId })],
      runInBackground: true,
      customPrompt: ENTERPRISE_PROMPT,
    });
    if (!res.ok) { console.warn('Cognee cognify failed', res.status); return null; }
    return (res.json() as any);
  } catch (e) { console.warn('Cognee cognify error:', e.message); return null; }
}

/** Convenience: stage content and schedule a graph rebuild. */
export async function ingest(text, { userId, kbId, nodeSet }: any = {}) {
  const added = await addText(text, { userId, kbId, nodeSet });
  if (added) cognify(userId, { kbId }).catch(() => {});
  return added;
}

// ── 3. Search (multi-hop grounded retrieval) ─────────────────────────────────

/** Recursively extract strings from any nested Cognee search result value. */
function extractStrings(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === 'string') return val.trim() ? [val.trim()] : [];
  if (Array.isArray(val)) return val.flatMap(extractStrings);
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    // Try common field names Cognee uses across API versions.
    for (const k of ['search_result', 'result', 'text', 'content', 'value', 'answer']) {
      if (v[k]) return extractStrings(v[k]);
    }
  }
  return [];
}

/**
 * Graph search. Default GRAPH_COMPLETION returns a synthesised, multi-hop
 * answer grounded in the extracted graph. Returns a string (or null).
 */
export async function graphSearch(query, { userId, kbId, searchType = 'GRAPH_COMPLETION', topK = 10 }: any = {}) {
  if (!configured() || !query?.trim()) return null;
  const dataset = resolveDataset({ userId, kbId });
  try {
    const res = await jpost('/api/v1/search', { searchType, query, datasets: [dataset], topK, includeReferences: false });
    if (!res.ok) {
      console.warn(`Cognee graphSearch (${searchType}) non-OK for dataset ${dataset}:`, res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await (res.json() as any);
    const parts = extractStrings(data);
    return parts.length ? [...new Set(parts)].join('\n\n') : null;
  } catch (e: any) { console.warn('Cognee graphSearch error:', e.message); return null; }
}

/**
 * Vector (chunk) search — retrieves semantically similar text chunks
 * from the Cognee dataset. Returns ranked results as an array of strings.
 */
export async function vectorSearch(query, { userId, kbId, topK = 10 }: any = {}) {
  if (!configured() || !query?.trim()) return [];
  const dataset = resolveDataset({ userId, kbId });
  try {
    const res = await jpost('/api/v1/search', { searchType: 'CHUNKS', query, datasets: [dataset], topK, includeReferences: false });
    if (!res.ok) {
      console.warn(`Cognee vectorSearch non-OK for dataset ${dataset}:`, res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await (res.json() as any);
    return [...new Set(extractStrings(data))];
  } catch (e: any) { console.warn('Cognee vectorSearch error:', e.message); return []; }
}

// ── Reciprocal Rank Fusion (RRF) ─────────────────────────────────────────────
// Merges two ranked lists using RRF. k=60 is standard (Cormack et al. 2009).
function rrfMerge(graphResults: string[], vectorResults: string[], k = 60): string[] {
  const scores = new Map<string, number>();
  graphResults.forEach((r, i) => {
    scores.set(r, (scores.get(r) || 0) + 1 / (k + i + 1));
  });
  vectorResults.forEach((r, i) => {
    scores.set(r, (scores.get(r) || 0) + 1 / (k + i + 1));
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([text]) => text);
}

/**
 * Hybrid retrieval: runs Graph Traversal + Vector Search in parallel,
 * merges results with Reciprocal Rank Fusion, and returns unified context.
 */
export async function hybridSearch(query, { userId, kbId, topK = 10 }: any = {}) {
  if (!configured() || !query?.trim()) return null;
  const opts = { userId, kbId, topK };
  const [graphResult, vectorResults] = await Promise.all([
    graphSearch(query, { ...opts, searchType: 'GRAPH_COMPLETION' }),
    vectorSearch(query, opts),
  ]);
  const graphParts = graphResult ? graphResult.split('\n\n').filter((s) => s.trim()) : [];
  const merged = rrfMerge(graphParts, vectorResults);
  if (merged.length === 0) return null;
  return merged.join('\n\n');
}

// ── 4. The extracted graph (for visualisation) ───────────────────────────────

async function datasetIdFor(userId, kbId?) {
  const res = await fetch(`${cogneeBase()}/api/v1/datasets/`, { headers: { 'X-API-Key': cogneeKey() } });
  if (!res.ok) return null;
  const list = await (res.json() as any);
  const name = resolveDataset({ userId, kbId });
  const found = (Array.isArray(list) ? list : []).find((d) => d.name === name || d.dataset_name === name);
  return found?.id || found?.dataset_id || null;
}

/** Real Cognee-extracted graph. If kbId is given, returns the KB-scoped graph. */
export async function getDatasetGraph(userId, kbId?) {
  if (!configured()) return null;
  try {
    const id = await datasetIdFor(userId, kbId);
    if (!id) return null;
    const res = await fetch(`${cogneeBase()}/api/v1/datasets/${id}/graph`, { headers: { 'X-API-Key': cogneeKey() } });
    if (!res.ok) return null;
    return (res.json() as any); // { nodes:[{id,label,type,properties}], edges:[...] }
  } catch (e) { console.warn('Cognee getDatasetGraph error:', e.message); return null; }
}

// ── 5. Personal memory (PSI, README §8) ──────────────────────────────────────

/** Remember a fact about the user (role, preferences, focus). */
export async function rememberMemory(text, { userId }: any = {}) {
  if (!configured() || !text?.trim()) return null;
  try {
    const form = new FormData();
    form.append('data', new Blob([text], { type: 'text/plain' }), `mem-${String(userId).slice(0, 8)}.txt`);
    form.append('datasetId', userDataset(userId));
    form.append('run_in_background', 'true');
    const res = await fetch(`${cogneeBase()}/api/v1/remember`, { method: 'POST', headers: { 'X-API-Key': cogneeKey() }, body: form });
    return res.ok ? (res.json() as any) : null;
  } catch (e) { console.warn('Cognee remember error:', e.message); return null; }
}

/** Recall personal memory relevant to the query. */
export async function recallMemory(query, { userId }: any = {}) {
  if (!configured() || !query?.trim()) return null;
  try {
    const res = await jpost('/api/v1/recall', { query, datasets: [userDataset(userId)] });
    if (!res.ok) return null;
    const data = await (res.json() as any);
    if (!Array.isArray(data)) return typeof data === 'string' ? data : null;
    const texts = data.map((r) => (r.text || r.search_result || r.raw?.value || '')).flat().filter((t) => typeof t === 'string' && t.trim());
    return texts.length ? [...new Set(texts)].join('\n') : null;
  } catch { return null; }
}

// ── Back-compat shims (old call sites) ───────────────────────────────────────
export async function rememberText(text, opts: any = {}) {
  // Old signature passed { filename }; new path needs userId (callers updated).
  return ingest(text, { userId: opts.userId, nodeSet: opts.nodeSet });
}
export async function recall(query, opts: any = {}) {
  return graphSearch(query, { userId: opts?.userId });
}

/**
 * Build the text that describes a connector's ingested items for the KG.
 */
export function formatConnectorPayload(kbId, userId, userEmail, platform, selectedItems) {
  const platformNames = {
    github: 'GitHub', gdocs: 'Google Docs', gslides: 'Google Slides', gsheets: 'Google Sheets',
    gcal: 'Google Calendar', jira: 'Jira', slack: 'Slack', salesforce: 'Salesforce',
  };
  const name = platformNames[platform] || platform;
  const itemLines = selectedItems.map((i) => `  - ${i.name}${i.meta ? ` [${i.meta}]` : ''}`).join('\n');
  return [
    `# hypr Knowledge Source: ${name}`,
    `Knowledge Base ID: ${kbId}`,
    `User: ${userEmail}  |  User ID: ${userId}`,
    `Connected at: ${new Date().toISOString()}`,
    ``,
    `The following ${name} items are authorized for ingestion into the knowledge graph:`,
    ``,
    itemLines,
  ].join('\n');
}
