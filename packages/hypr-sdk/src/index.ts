import { SimpleRetriver, HyperRetriever, Ingestor } from './retrievers.js';

export type { HyperClientConfig, QueryOptions, QueryResult, IngestOptions, IngestResult } from './types.js';
export { HyperApiError } from './base.js';
export { SimpleRetriver, HyperRetriever, Ingestor };

/**
 * ```ts
 * import { HyperClient } from 'hypr-sdk';
 *
 * const simpleRetriver = new HyperClient.simpleRetriver({
 *   apiKey: process.env.HYPER_API_KEY!,
 *   appId: process.env.HYPER_APP_ID!,
 *   userId: process.env.HYPER_USER_ID!,
 *   clientId: process.env.HYPER_CLIENT_ID!,
 * });
 * const answer = await simpleRetriver.query('What plans do we offer?');
 *
 * const hyperRetriver = new HyperClient.hyperRetriever({ ...same config });
 * const personalized = await hyperRetriver.query('What did I ask about last time?');
 *
 * const ingestor = new HyperClient.ingestor({ ...same config });
 * await ingestor.ingest('kb_123', 'Some document text to add to the knowledge base.');
 * ```
 */
export const HyperClient = {
  simpleRetriver: SimpleRetriver,
  hyperRetriever: HyperRetriever,
  ingestor: Ingestor,
};
