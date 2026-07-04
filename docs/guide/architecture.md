# Architecture

## Stack

- **Frontend**: React + Vite, single-page app (`web/src`).
- **Backend**: a single Express server (`web/server.ts`) — every `/api/*`
  route is registered there and deployed as one process (see `vercel.json`:
  all of `/api/*` routes to `server.ts`).
- **Knowledge Base store**: Neo4j (`web/api/cognee.ts`, `web/api/lib/neo4j.ts`).
- **Memory store**: Cognee Cloud, called over plain HTTP (`web/api/lib/cogneeMemory.ts`).
- **App/user data**: MongoDB (`web/api/mongodb.ts`).
- **LLM**: Fireworks AI, OpenAI-compatible endpoint, multi-key rotation
  (`web/api/lib/llm.ts`).
- **Local embeddings**: `all-MiniLM-L6-v2` via Transformers.js, in-process,
  no API key (`web/api/lib/embeddings.ts`) — used for Knowledge Base vector
  search only. Memory's embeddings are handled entirely by Cognee Cloud.

## Data flow: connecting a source

1. Owner authorizes a platform (GitHub, Google Docs/Slides/Calendar, Jira) via
   OAuth (`web/api/oauth.ts`), or uploads documents directly.
2. `web/api/ingest.ts` normalizes provider payloads into a common entity shape
   (`web/api/lib/schema.ts`) and writes into the Neo4j Knowledge Base
   (`ingestGitHubEntity` / `addText` in `cognee.ts`).
3. A periodic sync loop (`server.ts`, `syncAllDue`) re-polls connections whose
   last sync is older than `SYNC_INTERVAL_MINUTES` and ingests only what changed.
4. The Dashboard (`GET /api/stats`) and per-KB Insights (`GET /api/stats?kbId=`)
   read live aggregates straight out of the Neo4j graph via Cypher
   (`getUserGraphStats` in `cognee.ts`) — not a cached snapshot.

## Data flow: a chat turn

```
user message
  │
  ├─ Knowledge Base retrieval (Neo4j) — depth depends on search mode
  │    normal → single-shot vector/graph lookup
  │    hyper  → hybrid graph + vector, reranked
  │    deep   → planner decomposes the query, hybrid+rerank per sub-question
  │
  ├─ Memory recall (Cognee Cloud) — only for personalized surfaces
  │    (app-chat "hyper" mode is included from the app's Firebase-authenticated
  │     playground; /api/sdk/query "hyper" mode is the real per-end-user path)
  │
  ├─ generateReply() — Fireworks chain, model chosen by search mode
  │    (web/api/lib/llm.ts: NORMAL_CHAIN / DEEP_CHAIN)
  │
  └─ response, persisted to MongoDB; Memory updated fire-and-forget
```

See [Search modes](/guide/search-modes) for exactly which models and which
retrieval path each mode uses.

## Repo layout

```
web/
  api/            Express route handlers, one file per endpoint
  api/lib/        Shared modules (llm, embeddings, neo4j, cogneeMemory, appUsers, sdkAuth, schema)
  src/            React frontend
  server.ts       Registers every /api/* route

packages/
  hyper-sdk/      Published client SDK (HyperClient) — see /sdk/getting-started

docs/             This VitePress site
```
