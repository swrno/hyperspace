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

/** Per-user dataset name — true multi-tenant isolation. */
export function userDataset(userId) {
  return `hypr_user_${String(userId || 'anon').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
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

/** Stage text into the user's dataset (cheap). nodeSet tags the source. */
export async function addText(text, { userId, nodeSet }: any = {}) {
  if (!configured() || !text?.trim()) return null;
  try {
    const res = await jpost('/api/v1/add_text', {
      textData: [text],
      datasetName: userDataset(userId),
      ...(nodeSet ? { nodeSet: Array.isArray(nodeSet) ? nodeSet : [nodeSet] } : {}),
    });
    if (!res.ok) { console.warn('Cognee add_text failed', res.status, (await res.text()).slice(0, 160)); return null; }
    return (res.json() as any);
  } catch (e) { console.warn('Cognee add_text error:', e.message); return null; }
}

// ── 2. Cognify (build the graph) — debounced per user, runs in background ─────

const lastCognify = new Map(); // userId -> timestamp
const COGNIFY_DEBOUNCE_MS = 90_000;

export async function cognify(userId, { force = false }: any = {}) {
  if (!configured()) return null;
  const last = lastCognify.get(userId) || 0;
  if (!force && Date.now() - last < COGNIFY_DEBOUNCE_MS) return null; // avoid hammering the LLM
  lastCognify.set(userId, Date.now());
  try {
    const res = await jpost('/api/v1/cognify', {
      datasets: [userDataset(userId)],
      runInBackground: true,
      customPrompt: ENTERPRISE_PROMPT,
    });
    if (!res.ok) { console.warn('Cognee cognify failed', res.status); return null; }
    return (res.json() as any);
  } catch (e) { console.warn('Cognee cognify error:', e.message); return null; }
}

/** Convenience: stage content and schedule a graph rebuild. */
export async function ingest(text, { userId, nodeSet }: any = {}) {
  const added = await addText(text, { userId, nodeSet });
  if (added) cognify(userId).catch(() => {});
  return added;
}

// ── 3. Search (multi-hop grounded retrieval) ─────────────────────────────────

/**
 * Graph search. Default GRAPH_COMPLETION returns a synthesised, multi-hop
 * answer grounded in the extracted graph. Returns a string (or null).
 */
export async function graphSearch(query, { userId, searchType = 'GRAPH_COMPLETION', topK = 10 }: any = {}) {
  if (!configured() || !query?.trim()) return null;
  try {
    const res = await jpost('/api/v1/search', {
      searchType,
      query,
      datasets: [userDataset(userId)],
      topK,
      includeReferences: false,
    });
    if (!res.ok) return null;
    const data = await (res.json() as any);
    if (!Array.isArray(data)) return null;
    const parts = data.flatMap((r) => r.search_result || r.result || []).filter((s) => typeof s === 'string' && s.trim());
    return parts.length ? [...new Set(parts)].join('\n\n') : null;
  } catch (e) { console.warn('Cognee graphSearch error:', e.message); return null; }
}

// ── 4. The extracted graph (for visualisation) ───────────────────────────────

async function datasetIdFor(userId) {
  const res = await fetch(`${cogneeBase()}/api/v1/datasets/`, { headers: { 'X-API-Key': cogneeKey() } });
  if (!res.ok) return null;
  const list = await (res.json() as any);
  const name = userDataset(userId);
  const found = (Array.isArray(list) ? list : []).find((d) => d.name === name || d.dataset_name === name);
  return found?.id || found?.dataset_id || null;
}

/** Real Cognee-extracted graph for the user: { nodes, edges }. */
export async function getDatasetGraph(userId) {
  if (!configured()) return null;
  try {
    const id = await datasetIdFor(userId);
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
