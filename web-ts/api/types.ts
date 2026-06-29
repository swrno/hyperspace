/**
 * Shared backend domain types.
 *
 * The API layer works with highly dynamic data (Mongo documents + third-party
 * payloads), so many fields are optional/loose. These types document the
 * canonical shapes the pipeline produces and consumes.
 */

/** Internal entity type after provider normalisation (see lib/schema.ts). */
export type EntityType =
  | 'WorkItem'
  | 'CodeChange'
  | 'Commit'
  | 'Sprint'
  | 'Project'
  | 'Repository'
  | 'Document'
  | 'Event'
  | 'Person'
  | string;

/** Canonical normalised entity stored in Mongo `kb_entities` + rendered to Cognee. */
export interface NormalizedEntity {
  id: string;
  type: EntityType;
  source: string;
  externalId: string;
  externalKey?: string;
  title?: string;
  status?: string;
  body?: string;
  url?: string;
  authorRef?: string;
  repoRef?: string;
  projectRef?: string;
  labels?: string[];
  linkedKeys?: string[];
  updatedAt?: string;
  raw?: Record<string, unknown>;
  // Mongo / runtime extras
  _id?: string;
  entityId?: string;
  userId?: string;
  ingestedAt?: string;
}

/** Item the user can pick to ingest (repo, doc, channel, …). */
export interface ConnectorItem {
  id: string;
  name: string;
  meta?: string;
}

/** A node in the structural / semantic knowledge graph. */
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  source?: string;
  status?: string;
  url?: string | null;
  hub?: boolean;
  degree?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  entities: number;
  sources: number;
  people: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

/** OAuth tokens returned by a provider's code exchange / refresh. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

/** Provider identity captured at connect time. */
export interface ConnectionIdentity {
  accountId?: string | null;
  username?: string | null;
  cloudId?: string | null;
  siteUrl?: string | null;
  siteName?: string | null;
}

export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'error';

/** A stored provider connection (Mongo `integration_connections`). */
export interface Connection {
  userId: string;
  provider: string;
  providerAccountId?: string | null;
  providerUsername?: string | null;
  cloudId?: string | null;
  siteUrl?: string | null;
  siteName?: string | null;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string | null;
  status?: 'active' | 'revoked' | string;
  createdAt?: string;
  updatedAt?: string;
  initialSyncStatus?: SyncStatus;
  lastPollCursor?: string | null;
  lastSyncAt?: string | null;
  entityCount?: number;
  error?: string | null;
  selectedRepos?: string[];
}

export type UserRole = 'admin' | 'user';
export type UserTier = 'free' | 'pro' | 'ultra';

/** Application user record (Mongo `users`). */
export interface AppUser {
  uid: string;
  email: string;
  name: string;
  avatar?: string;
  tier?: UserTier;
  role?: UserRole;
  customHourLimit?: number | null;
  createdAt?: string;
  updatedAt?: string;
  _id?: unknown;
}

/** Error augmented with a `revoked` flag by provider refresh helpers. */
export interface RevocableError extends Error {
  revoked?: boolean;
}
