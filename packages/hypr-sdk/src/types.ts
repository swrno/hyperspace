/** Credentials + identity for every hypr-sdk call. */
export interface HyperClientConfig {
  /** App-level secret (`sk_live_...`), generated when the app was created in hypr. */
  apiKey: string;
  /** Which hypr app to talk to (`app_...`). */
  appId: string;
  /** Your own end-user's id — scopes retrieval and personalization memory to them. */
  userId: string;
  /** Public client identifier paired with apiKey (`client_...`). */
  clientId: string;
  /** Override the hypr API base URL (defaults to the production endpoint). */
  baseUrl?: string;
}

export interface QueryOptions {
  /** Groups turns into one conversation thread; omit for a one-off query. */
  sessionId?: string;
}

export interface QueryResult {
  response: string;
  mode: 'simple' | 'hyper';
}

export interface IngestOptions {
  docName?: string;
}

export interface IngestResult {
  ok: boolean;
  chunks?: number;
  entities?: number;
}
