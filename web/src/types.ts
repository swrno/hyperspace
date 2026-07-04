// Shared domain types for the hypr frontend.
import type { ReactNode } from 'react';

/* ── Auth / user ──────────────────────────────────────────────────────────── */
export type UserRole = 'admin' | 'user';
export type UserTier = 'free' | 'pro' | 'ultra';

export interface User {
  uid: string;
  email: string;
  name: string;
  avatar?: string;
  role?: UserRole;
  tier?: UserTier;
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  avatar?: string;
  tier: UserTier;
  customHourLimit: number | null;
  hourlyUsage: number;
}

/* ── Chat ─────────────────────────────────────────────────────────────────── */
export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: number | string;
  role: MessageRole;
  content: string;
  reasoning?: string;
  timestamp: string;
  sessionId?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

/** Retrieval depth modes surfaced in the input-box picker. */
export type ChatModelId = 'normal' | 'deep' | 'hyper';

export interface ChatModel {
  id: ChatModelId;
  label: string;
  short: string;
  sub: string;
}

export interface Settings {
  model: string;
  temperature: number;
}

/** Top-level screen the main app shell is showing. */
export type ActiveScreen =
  | 'dashboard'
  | 'applications'
  | 'knowledge'
  | 'integrations'
  | 'api-keys'
  | 'admin';

/** An application created by the user, with its own chat scope, prompt and LLM settings. */
export interface Application {
  id: string;
  appId?: string;
  apiKey?: string;
  /** Public client identifier for the hyper-sdk (paired with apiKey to authenticate SDK calls). */
  clientId?: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** IDs of Knowledge Bases whose data is used as context in this app's playground. */
  linkedKbIds: string[];
  /** Isolated per-app chat history. */
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

/* ── Connectors / platforms ───────────────────────────────────────────────── */
export type PlatformId =
  | 'github'
  | 'gdocs'
  | 'gslides'
  | 'gsheets'
  | 'gcal'
  | 'jira'
  | 'slack'
  | 'salesforce';

export interface Platform {
  id: PlatformId;
  name: string;
  slug: string;
  color: string;
  noun: string;
  nounPlural: string;
  selectTitle: string;
  authBlurb: string;
  scopes: string[];
}

export interface ConnectorItem {
  id: string;
  name: string;
  meta?: string;
}

export interface Connector {
  connected?: boolean;
  account?: string;
  selectedItems?: ConnectorItem[];
  status?: string;
  lastSync?: string;
}

/**
 * Connector state keyed by platform id. A string index signature (rather than
 * Record<PlatformId, …>) mirrors the dynamic indexing the app does with keys
 * derived from Object.keys(...) and free-form platform-id strings.
 */
export type Connectors = { [id: string]: Connector | undefined };

export type IngestStatus = 'queued' | 'ingesting' | 'synced';
export type IngestProgress = Record<string, IngestStatus>;

export type ConnectorStage = 'auth' | 'select' | 'ingest';

/** Renders a platform's brand icon. Accepts any object exposing an `id`. */
export type PlatformIconFn = (p: { id: string }, size?: number) => ReactNode;

/* ── Dashboard stats (from /api/stats) ────────────────────────────────────── */
export interface StatsConnection {
  provider: string;
  initialSyncStatus?: 'in_progress' | 'pending' | 'completed' | 'error';
}

export interface RecentItem {
  id: string;
  title: string;
  type: string;
  source: string;
  status?: string;
  url?: string;
  repoRef?: string;
  projectRef?: string;
  updatedAt?: string;
}

export interface Stats {
  total?: number;
  documents?: number;
  knowledgeBases?: number;
  connections?: StatsConnection[];
  bySource?: { key: string; n: number }[];
  byType?: { key: string; n: number }[];
  byStatus?: { key: string; n: number }[];
  timeline?: { date: string; n: number }[];
  graph?: { nodes: number; edges: number };
  recent?: RecentItem[];
}

/* ── Knowledge graph (from /api/graph) ────────────────────────────────────── */
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  degree?: number;
  status?: string;
  url?: string;
  properties?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodes: number; edges: number };
}

/* ── Knowledge bases (from /api/kb) ───────────────────────────────────────── */
export interface KbDocument {
  id: string;
  name: string;
  size?: number;
  createdAt?: string;
  status?: string;
  type?: 'text' | 'pdf' | string;
  content?: string;
  contentBase64?: string;
}

/** A source (repo, docs, channel…) attached to a specific knowledge base. */
export interface KbSource {
  platform: string;
  items: ConnectorItem[];
  attachedAt?: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documents?: KbDocument[];
  sources?: KbSource[];
  createdAt?: string;
  updatedAt?: string;
}
