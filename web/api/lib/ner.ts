/// <reference types="node" />
/**
 * Named entity recognition via distilbert-base-multilingual-cased-ner-hrl, run
 * locally with Transformers.js (ONNX / CPU) — no LLM call, no rate limits.
 * Tags: PER, ORG, LOC (aggregated from B-/I- token tags into whole-word spans
 * via aggregation_strategy 'simple'). The model is downloaded from the HF hub
 * once and cached; the first call after boot pays the load cost.
 */

import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/distilbert-base-multilingual-cased-ner-hrl';
const MAX_CHARS = 4_000;
const MIN_SCORE = 0.6;

// Maps NER tag groups to the graph schema's Entity.type values
// (People | Organisation | Product | Location | Concept | Technology | Event).
// MISC and any unrecognised tag fall back to Concept.
const TYPE_MAP: Record<string, string> = {
  PER: 'People',
  ORG: 'Organisation',
  LOC: 'Location',
};

export interface NamedEntity { name: string; description: string; type: string }

let _ner: Promise<any> | null = null;
function getNer(): Promise<any> {
  if (!_ner) _ner = pipeline('token-classification', MODEL);
  return _ner;
}

/** Extract named entities from text using a local NER model (no LLM). */
export async function extractNamedEntities(text: string): Promise<NamedEntity[]> {
  const input = (text || '').trim().slice(0, MAX_CHARS);
  if (!input) return [];
  try {
    const ner = await getNer();
    const output: any[] = await ner(input, { aggregation_strategy: 'simple' });

    const seen = new Map<string, NamedEntity>();
    for (const item of output) {
      const group = String(item.entity_group || item.entity || '').replace(/^[BI]-/, '');
      const type = TYPE_MAP[group] || 'Concept';
      const name = String(item.word || '').trim();
      if (!name || name.length < 2 || item.score < MIN_SCORE) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name, description: `${group} entity mentioned in the text`, type });
    }
    return [...seen.values()].slice(0, 15);
  } catch (e: any) {
    console.warn('[ner] extractNamedEntities failed:', e?.message);
    return [];
  }
}
