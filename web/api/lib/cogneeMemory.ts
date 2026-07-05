/**
 * Personalization memory — backed by the real, already-provisioned Cognee
 * Cloud tenant (COGNEE_BASE_URL / COGNEE_API_KEY), called over plain HTTP —
 * same shape as every other external model call in this codebase (see
 * lib/llm.ts). No SDK, no local process, no Python.
 *
 * Split of responsibilities (do not confuse the two):
 *   - Neo4j (cognee.ts)       → Knowledge Base: documents, entities, KB graphs.
 *   - Cognee Cloud (this file) → Memory: key facts extracted from a user's own
 *                                conversations, used to personalize future replies.
 *
 * Isolation: each end-user gets their own Cognee dataset (`hypr_user_<id>`).
 * Cognee partitions storage per dataset (scoped to our tenant's API key), so
 * recall for one user's dataset can never surface another user's data.
 */

function baseUrl(): string | null {
  const url = process.env.COGNEE_BASE_URL || process.env.COGNEE_SERVICE_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

function apiKey(): string | null {
  return process.env.COGNEE_API_KEY || null;
}

/** True if a Cognee Cloud tenant is configured. */
export function memoryConfigured(): boolean {
  return !!(baseUrl() && apiKey());
}

function datasetForUser(userId: string): string {
  return `hypr_user_${String(userId || 'anon').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}

/**
 * Extract and store key facts from a piece of user conversation, scoped to
 * that user's own Cognee dataset. Fire-and-forget by callers; never throws.
 */
export async function rememberUserFact(userId: string, text: string): Promise<void> {
  const url = baseUrl(), key = apiKey();
  if (!url || !key || !userId || !text?.trim()) return;
  try {
    const form = new FormData();
    form.append('data', new Blob([text], { type: 'text/plain' }), 'memory.txt');
    form.append('datasetName', datasetForUser(userId));
    const res = await fetch(`${url}/api/v1/remember`, {
      method: 'POST',
      headers: { 'X-Api-Key': key },
      body: form,
    });
    if (!res.ok) console.warn('Cognee rememberUserFact failed:', res.status, await res.text().catch(() => ''));
  } catch (e: any) {
    console.warn('Cognee rememberUserFact failed:', e.message);
  }
}

/**
 * Recall personalized context for a user relevant to `query`. Returns null on
 * any failure (including "nothing remembered for this user yet" — a 404).
 *
 * Uses searchType=RAG_COMPLETION with onlyContext=true: this returns the raw
 * relevant remembered text WITHOUT running Cognee's own answer-synthesis LLM.
 * That is both what we want (our chat model does the answering — we only need
 * the facts as grounding) and far faster: ~1.5s vs 4–7s for the completion
 * search types. The old GRAPH_COMPLETION path took 4–7s, so the caller's short
 * race-timeout cut it off every time and memory silently never surfaced.
 *
 * A hard AbortController cap guarantees this can't hang the chat request even
 * if Cognee has a cold start.
 */
export async function recallUserContext(userId: string, query: string): Promise<string | null> {
  const url = baseUrl(), key = apiKey();
  if (!url || !key || !userId || !query?.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/api/v1/search`, {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        datasets: [datasetForUser(userId)],
        searchType: 'RAG_COMPLETION',
        onlyContext: true,
        topK: 5,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null; // 404 = no dataset yet for this user; anything else is best-effort
    const data: any = await res.json();
    // With onlyContext=true, search_result is a plain string; the completion
    // search types return string[]. Handle both, and drop Cognee's internal
    // node-dump markers if the graph path ever produces them.
    const raw = data?.[0]?.search_result;
    const text = Array.isArray(raw)
      ? raw.filter((x) => typeof x === 'string').join('\n')
      : (typeof raw === 'string' ? raw : '');
    const cleaned = text.replace(/__node_content_(?:start|end)__/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return cleaned || null;
  } catch (e: any) {
    if (e.name !== 'AbortError') console.warn('Cognee recallUserContext failed:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
