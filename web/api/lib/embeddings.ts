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

/** Split a long document into overlapping fixed-size chunks. Structural
 *  fallback used when semantic chunking isn't worthwhile or fails. */
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

/** Cosine similarity between two equal-length vectors (0 if either is empty). */
function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/** Split prose into sentences on terminators + hard paragraph breaks. */
function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** p-th percentile (0–100) of a numeric array (linear interpolation). */
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface SemanticChunkOpts {
  breakpointPercentile?: number; // similarity-distance percentile that starts a new chunk
  bufferSize?: number;           // ± neighbour sentences combined before embedding (noise reduction)
  targetMaxChars?: number;       // force-split a chunk that would exceed this
  minChunkChars?: number;        // merge a trailing chunk smaller than this into the previous one
  maxSentences?: number;         // cost cap — sentences past this are appended via chunkText()
}

/**
 * True semantic chunking: embed each (buffered) sentence, then start a new chunk
 * wherever the semantic distance between consecutive sentences spikes above a
 * percentile threshold. Falls back to structural chunkText() on short input or
 * any error, so ingestion never breaks on the free tier.
 */
export async function semanticChunkText(text: string, opts: SemanticChunkOpts = {}): Promise<string[]> {
  const {
    breakpointPercentile = 90,
    bufferSize = 1,
    targetMaxChars = 1600,
    minChunkChars = 200,
    maxSentences = 400,
  } = opts;

  try {
    const clean = (text || '').trim();
    if (clean.length < 300) return clean ? [clean] : [];

    let sentences = splitSentences(clean);
    if (sentences.length < 3) return chunkText(clean);

    // Cost cap: sentences beyond maxSentences are chunked structurally at the end.
    let tail: string[] = [];
    if (sentences.length > maxSentences) {
      tail = chunkText(sentences.slice(maxSentences).join(' '));
      sentences = sentences.slice(0, maxSentences);
    }

    // Embed each sentence combined with a ±bufferSize neighbour window.
    const combined = sentences.map((_, i) => {
      const lo = Math.max(0, i - bufferSize);
      const hi = Math.min(sentences.length, i + bufferSize + 1);
      return sentences.slice(lo, hi).join(' ');
    });
    const embeddings = await embedBatch(combined, 'RETRIEVAL_DOCUMENT');
    if (embeddings.some((e) => !e?.length)) return chunkText(clean); // embedding gap → fallback

    // Distance between consecutive sentences; split where distance exceeds the percentile.
    const distances: number[] = [];
    for (let i = 0; i < sentences.length - 1; i++) distances.push(1 - cosine(embeddings[i], embeddings[i + 1]));
    const threshold = percentile(distances, breakpointPercentile);

    const chunks: string[] = [];
    let current: string[] = [];
    let curLen = 0;
    const flush = () => { if (current.length) { chunks.push(current.join(' ')); current = []; curLen = 0; } };
    for (let i = 0; i < sentences.length; i++) {
      current.push(sentences[i]);
      curLen += sentences[i].length + 1;
      const breakpoint = i < distances.length && distances[i] > threshold;
      if (breakpoint || curLen >= targetMaxChars) flush();
    }
    flush();

    // Merge a too-small trailing chunk back into the previous one.
    if (chunks.length > 1 && chunks[chunks.length - 1].length < minChunkChars) {
      chunks[chunks.length - 2] = `${chunks[chunks.length - 2]} ${chunks.pop()}`;
    }

    return [...chunks, ...tail];
  } catch (e: any) {
    console.warn('[embeddings] semanticChunkText failed, using structural chunker:', e?.message);
    return chunkText(text);
  }
}
