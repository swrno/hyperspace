import { HyperBase } from './base.js';
import type { QueryOptions, QueryResult, IngestOptions, IngestResult } from './types.js';

/**
 * Fast, single-shot retrieval — one KB lookup + an LLM answer. No cross-source
 * planning. Personalization memory is off by default; set `personalisation:
 * true` in the config to recall + update it without paying for multi-hop.
 */
export class SimpleRetriver extends HyperBase {
  async query(message: string, opts: QueryOptions = {}): Promise<string> {
    const result = await this.post<QueryResult>('/api/sdk/query', {
      message,
      sessionId: opts.sessionId,
      mode: 'simple',
      personalisation: this.config.personalisation,
    });
    return result.response;
  }
}

/**
 * Deep retrieval — multi-hop knowledge-base search plus this end-user's own
 * personalization memory (facts recalled from their past conversations,
 * scoped to `userId` and never shared across users).
 */
export class HyperRetriever extends HyperBase {
  async query(message: string, opts: QueryOptions = {}): Promise<string> {
    const result = await this.post<QueryResult>('/api/sdk/query', {
      message,
      sessionId: opts.sessionId,
      mode: 'hyper',
      personalisation: this.config.personalisation,
    });
    return result.response;
  }
}

/**
 * Ingests content into one of the app's linked Knowledge Bases. Personalization
 * memory builds automatically from conversation via the retrievers above — this
 * is for the app's shared documents, not per-user memory.
 */
export class Ingestor extends HyperBase {
  async ingest(kbId: string, text: string, opts: IngestOptions = {}): Promise<IngestResult> {
    return this.post<IngestResult>('/api/sdk/ingest', { kbId, text, docName: opts.docName });
  }
}
