/// <reference types="node" />
/**
 * Text embeddings via Google's gemini-embedding-001 model (3072 dims).
 * Reuses GEMINI_API_KEY which is already required for other features.
 *
 * taskType:
 *   'RETRIEVAL_DOCUMENT' — for content being stored (higher recall)
 *   'RETRIEVAL_QUERY'    — for search queries
 */

const MODEL = 'gemini-embedding-001';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CHARS = 8_000; // Gemini embedding input limit

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is required for embeddings');
  return k;
}

export async function embed(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  _retries = 5,
): Promise<number[]> {
  for (let attempt = 0; attempt <= _retries; attempt++) {
    const res = await fetch(`${BASE}/${MODEL}:embedContent?key=${key()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: text.slice(0, MAX_CHARS) }] },
        taskType,
      }),
    });

    if (res.status === 429 && attempt < _retries) {
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = Math.min(2000 * Math.pow(2, attempt), 32000);
      console.warn(`[embeddings] 429 rate limit, retrying in ${delay}ms (attempt ${attempt + 1}/${_retries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Embedding API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await (res.json() as any);
    return data.embedding?.values ?? [];
  }
  return [];
}

/** Embed multiple texts in parallel (batched to avoid rate limits). */
export async function embedBatch(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  concurrency = 2,
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const embeddings = await Promise.all(batch.map((t) => embed(t, taskType)));
    results.push(...embeddings);
    // Brief pause between batches to stay within free-tier RPM limits
    if (i + concurrency < texts.length) await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

/** Split a long document into overlapping chunks for embedding. */
export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length >= 40) chunks.push(chunk);
    i += size - overlap;
  }
  return chunks;
}
