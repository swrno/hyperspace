/**
 * Shared LLM routing for every server-side model call (chat, app-chat, prompt
 * generation, ingestion NER). One place owns the model ids and the multi-key
 * Fireworks rotation so a single key outage never breaks a feature.
 *
 * Fireworks multi-key: set FIREWORKS_API_KEYS to a comma-separated list (or a
 * single FIREWORKS_API_KEY). Calls round-robin across keys and, on a rate-limit
 * (429/503) from one key, transparently retry the next key before giving up.
 *
 * Two model tiers:
 *  - Normal search: fast general-purpose chat models (see NORMAL_CHAIN).
 *  - Deep Hyper search: a frontier reasoner plans/decomposes the query
 *    (PLANNER_CHAIN), a reranker (qwen3-reranker-8b) re-scores merged
 *    graph+vector candidates, and a frontier model synthesises the answer
 *    (DEEP_CHAIN).
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Provider = 'fireworks';
export type ProviderModel = [Provider, string];

// Canonical Fireworks model ids. Change here, everywhere updates.
export const MODELS = {
  // Normal search mode.
  normalGlm:    'accounts/fireworks/models/glm-5p2',
  normalGptOss: 'accounts/fireworks/models/gpt-oss-120b',
  // Deep Hyper search: query planner / decomposer.
  deepPlanner:      'accounts/fireworks/models/deepseek-v4-pro',
  deepPlannerAlt:   'accounts/fireworks/models/kimi-k2p6',
  // Deep Hyper search: synthesis ("the brain").
  deepSynthesis:    'accounts/fireworks/models/kimi-k2p6',
  deepSynthesisAlt: 'accounts/fireworks/models/deepseek-v4-pro',
  // Reranker for Deep Hyper search retrieval.
  reranker: 'accounts/fireworks/models/qwen3-reranker-8b',
} as const;

/** Normal search mode: fast general-purpose chat, falls back across 2 models. */
export const NORMAL_CHAIN: ProviderModel[] = [
  ['fireworks', MODELS.normalGlm],
  ['fireworks', MODELS.normalGptOss],
];

/** Deep Hyper search: query planner / decomposer chain. */
export const PLANNER_CHAIN: ProviderModel[] = [
  ['fireworks', MODELS.deepPlanner],
  ['fireworks', MODELS.deepPlannerAlt],
];

/** Deep Hyper search: final-answer synthesis chain. */
export const DEEP_CHAIN: ProviderModel[] = [
  ['fireworks', MODELS.deepSynthesis],
  ['fireworks', MODELS.deepSynthesisAlt],
];

/** Default chain for general-purpose calls that don't pick a mode. */
export const DEFAULT_CHAIN: ProviderModel[] = NORMAL_CHAIN;

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const FIREWORKS_RERANK_URL = 'https://api.fireworks.ai/inference/v1/rerank';

/** All configured Fireworks keys (FIREWORKS_API_KEYS csv, else FIREWORKS_API_KEY). */
export function fireworksKeys(): string[] {
  const multi = (process.env.FIREWORKS_API_KEYS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (multi.length) return multi;
  const single = (process.env.FIREWORKS_API_KEY || '').trim();
  return single ? [single] : [];
}

/** True if at least one provider can be called. */
export function llmConfigured(): boolean {
  return !!fireworksKeys().length;
}

class LLMError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`${status}`);
    this.status = status;
    this.body = body;
  }
}

type CallOpts = { maxTokens?: number; temperature?: number; topP?: number };

async function callOpenAICompatible(
  url: string, key: string | undefined, model: string, messages: ChatMessage[], opts: CallOpts,
): Promise<string> {
  if (!key) throw new Error('key not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 2048,
      ...(opts.topP != null ? { top_p: opts.topP } : {}),
    }),
  });
  if (!res.ok) throw new LLMError(res.status, await res.text().catch(() => ''));
  return (await (res.json() as any)).choices?.[0]?.message?.content?.trim() || '';
}

// Round-robin cursor so load spreads across Fireworks keys across calls.
let _fwCursor = 0;

// Per-key errors that mean "this key is unusable right now, try the next one":
//   401 invalid/revoked key · 402 out of credits · 403 forbidden ·
//   429 rate-limited · 503 capacity. With multiple keys under tight credit
//   limits, one exhausted key must transparently fail over to another.
// Everything else (400/413 bad or oversized request) is the request's fault and
// won't be fixed by a different key, so we fail fast to the next model.
const FW_ROTATE_STATUS = new Set([401, 402, 403, 429, 503]);

async function callFireworks(model: string, messages: ChatMessage[], opts: CallOpts): Promise<string> {
  const keys = fireworksKeys();
  if (!keys.length) throw new Error('FIREWORKS_API_KEY not set');
  let lastErr: any;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(_fwCursor + i) % keys.length];
    try {
      const out = await callOpenAICompatible(FIREWORKS_URL, key, model, messages, opts);
      _fwCursor = (_fwCursor + i + 1) % keys.length; // next call starts on the following key
      return out;
    } catch (e: any) {
      lastErr = e;
      if (!(e instanceof LLMError) || !FW_ROTATE_STATUS.has(e.status)) throw e;
      // Advance the cursor past a dead key so subsequent calls don't lead with it.
      if (e.status === 401 || e.status === 402 || e.status === 403) _fwCursor = (_fwCursor + i + 1) % keys.length;
      console.warn(`Fireworks key #${(_fwCursor + i) % keys.length + 1} failed (${e.status}), trying next key…`);
    }
  }
  throw lastErr;
}

/**
 * Rerank candidate documents against a query via Fireworks' qwen3-reranker-8b.
 * Returns documents sorted by relevance (best first), sliced to topN. Uses the
 * same multi-key rotation as chat calls; on total failure returns docs as-is
 * (input order) so callers can fall back to their own merge/ranking.
 */
export async function rerankFireworks(query: string, documents: string[], topN?: number): Promise<string[]> {
  if (!documents.length) return [];
  const keys = fireworksKeys();
  if (!keys.length) return documents.slice(0, topN);
  let lastErr: any;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(_fwCursor + i) % keys.length];
    try {
      const res = await fetch(FIREWORKS_RERANK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODELS.reranker, query, documents }),
      });
      if (!res.ok) throw new LLMError(res.status, await res.text().catch(() => ''));
      const data: any = await res.json();
      const ranked = (data.data || [])
        .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
        .map((r: any) => documents[r.index]);
      return topN != null ? ranked.slice(0, topN) : ranked;
    } catch (e: any) {
      lastErr = e;
      if (!(e instanceof LLMError) || !FW_ROTATE_STATUS.has(e.status)) break;
      console.warn(`Fireworks rerank key #${(i % keys.length) + 1} failed (${e.status}), trying next key…`);
    }
  }
  console.warn('Fireworks rerank failed, returning unranked candidates:', lastErr?.message);
  return documents.slice(0, topN);
}

const CALL: Record<Provider, (m: string, msgs: ChatMessage[], o: CallOpts) => Promise<string>> = {
  fireworks: callFireworks,
};

/**
 * Run a message list through a model fallback chain, returning the first
 * non-empty completion. Throws only if every model in the chain fails.
 */
export async function generateReply(
  messages: ChatMessage[],
  chain: ProviderModel[] = DEFAULT_CHAIN,
  opts: CallOpts = {},
): Promise<string> {
  let lastErr: any;
  for (const [provider, model] of chain) {
    try {
      const out = await CALL[provider](model, messages, opts);
      if (out) return out;
    } catch (e: any) {
      lastErr = e;
      console.warn(`Provider ${provider} (${model}) failed:`, e.message);
    }
  }
  throw new Error(lastErr ? `All providers failed (${lastErr.message})` : 'No AI providers configured');
}
