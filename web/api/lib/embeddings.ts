/// <reference types="node" />
/**
 * Text embeddings via sentence-transformers/all-MiniLM-L6-v2, run locally with
 * Transformers.js (ONNX / CPU) — no external API and no rate limits. 384-dim,
 * mean-pooled and L2-normalized (cosine-ready). The model is downloaded from the
 * HF hub once (~90MB) and cached; the first call after boot pays the load cost.
 *
 * `taskType` is accepted for signature compatibility but has no effect —
 * all-MiniLM-L6-v2 is a symmetric model (no query instruction prefix, unlike BGE).
 */

import { pipeline } from '@huggingface/transformers';

export const EMBED_DIM = 384; // all-MiniLM-L6-v2 output dimension
const MODEL = 'Xenova/all-MiniLM-L6-v2';
// MiniLM caps at ~256 tokens (~1000 chars); the pipeline truncates past that, so
// text beyond this is not reflected in the embedding.
const MAX_CHARS = 1_000;
const SUB_BATCH = 16; // bound memory/latency for large batches (e.g. per-sentence semantic chunking)

let _extractor: Promise<any> | null = null;
function getExtractor(): Promise<any> {
  if (!_extractor) _extractor = pipeline('feature-extraction', MODEL);
  return _extractor;
}

/** Embed one text. Returns a 384-dim unit vector (or [] on empty input). */
export async function embed(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const [v] = await embedBatch([text], taskType);
  return v ?? [];
}

/** Embed many texts locally, sub-batched to bound memory. Returns 384-dim vectors. */
export async function embedBatch(
  texts: string[],
  _taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  if (!texts?.length) return [];
  const extractor = await getExtractor();
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += SUB_BATCH) {
    const batch = texts.slice(i, i + SUB_BATCH).map((t) => String(t || '').slice(0, MAX_CHARS));
    const out = await extractor(batch, { pooling: 'mean', normalize: true });
    results.push(...(out.tolist() as number[][]));
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
