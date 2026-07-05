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
 * Uses GRAPH_COMPLETION_COT — Cognee's chain-of-thought search type, which
 * runs iterative rounds of graph retrieval + reasoning to target the actual
 * query instead of a single-shot lookup. This matters because the memory
 * dataset accumulates raw, unstructured conversation turns over time (see
 * rememberUserFact below) — a single-shot search can surface a superficially
 * similar but unrelated old note (e.g. a name mentioned in an old aside)
 * with no reasoning step to filter it out. `session_id`, when passed, scopes
 * the reasoning to one conversation thread rather than the user's entire
 * history.
 */
export async function recallUserContext(userId: string, query: string, sessionId?: string): Promise<string | null> {
  const url = baseUrl(), key = apiKey();
  if (!url || !key || !userId || !query?.trim()) return null;
  try {
    const res = await fetch(`${url}/api/v1/search`, {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        datasets: [datasetForUser(userId)],
        searchType: 'GRAPH_COMPLETION_COT',
        topK: 5,
        maxIter: 3,
        ...(sessionId ? { sessionId } : {}),
      }),
    });
    if (!res.ok) return null; // 404 = no dataset yet for this user; anything else is best-effort
    const data: any = await res.json();
    const results: string[] = data?.[0]?.search_result || [];
    const text = results.filter(Boolean).join('\n');
    return text.trim() || null;
  } catch (e: any) {
    console.warn('Cognee recallUserContext failed:', e.message);
    return null;
  }
}
