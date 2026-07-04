/**
 * Shared LLM routing for every server-side model call (chat, app-chat, prompt
 * generation, ingestion NER). One place owns the model ids and the multi-key
 * Fireworks rotation so a single key outage never breaks a feature.
 *
 * Fireworks multi-key: set FIREWORKS_API_KEYS to a comma-separated list (or a
 * single FIREWORKS_API_KEY). Calls round-robin across keys and, on a rate-limit
 * (429/503) from one key, transparently retry the next key before giving up.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Provider = 'fireworks';
export type ProviderModel = [Provider, string];

// Canonical Fireworks model ids. Change here, everywhere updates.
export const MODELS = {
  fireworksPrimary: 'accounts/fireworks/models/glm-5p2',
  fireworksLarge:   'accounts/fireworks/models/kimi-k2p7-code',
} as const;

/** Default chain for general-purpose calls: primary model, falling back to the other. */
export const DEFAULT_CHAIN: ProviderModel[] = [
  ['fireworks', MODELS.fireworksPrimary],
  ['fireworks', MODELS.fireworksLarge],
];

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

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
