# System Architecture

This page details the structural components, data flow routing, and backend systems that power `hypr`.

---

## The Tech Stack

`hypr` is built for performance, horizontal scalability, and low retrieval latency:

* **Frontend**: React + Vite SPA (`web/src`), styled with Tailwind CSS, Lucide icons, and interactive Sigma.js / WebGL graphs (`react-force-graph-3d`) for visual analytics.
* **Backend Server**: Single Express server (`web/server.ts`). Every `/api/*` route is registered there and compiled/transpiled with `tsx`.
* **Deployment Topology**: Designed as a serverless or single-instance application (configured for Vercel/Node via `vercel.json` routing all `/api/*` requests to the monolithic server).
* **Graph Store**: Neo4j, accessed via the official `neo4j-driver`. Node and edge logic resides in `web/api/cognee.ts` and `web/api/lib/neo4j.ts`.
* **Personalization Memory**: Cognee Cloud, accessed over HTTPS. All transactions are scoped per dataset using the user's ID as the partition key (`web/api/lib/cogneeMemory.ts`).
* **Document Metadata & Config**: MongoDB (`web/api/mongodb.ts`) for storing application settings, API keys, sync schedules, and lightweight end-user metadata.
* **LLM Engine**: Fireworks AI, with support for multi-key rotation and secondary fallback routing to Groq/Gemini to ensure 99.9% uptime.
* **In-Process Embeddings**: `@huggingface/transformers` running the `all-MiniLM-L6-v2` model in-process. This generates 384-dimensional vector embeddings on the fly without making external network calls, keeping Knowledge Base indexing extremely fast and cost-effective.

---

## Detailed Data Flows

### 1. Ingestion Pipeline & OAuth Sync

When a workspace owner connects an external platform (e.g., GitHub, Jira, or Google Workspace), the following sequence occurs:

1. **Authorization**: OAuth credentials are authenticated via `web/api/oauth.ts` and stored securely in MongoDB.
2. **Schema Ingestion**: `web/api/ingest.ts` polls the connector, fetches recent documents/tickets/code edits, and normalizes them into standard schema items defined in `web/api/lib/schema.ts`.
3. **Graph Writing**: Normalised entities are loaded into Neo4j via transactional Cypher queries, creating nodes like `:Document`, `:Repo`, `:Issue`, and `:CalendarEvent`, then linking them.
4. **Vector Generation**: Text chunks are parsed, run through the in-process `all-MiniLM-L6-v2` embedder, and written as vector properties on `:Chunk` nodes.
5. **Periodic Syncing**: A background loop in `web/server.ts` checks MongoDB connection timestamps and executes `syncAllDue` every 15 minutes, fetching only delta updates.

---

### 2. Query Retrieval & Prompt Construction

A user query undergoes a structured, multi-phase retrieval flow before being answered:

```
                  ┌─────────────────┐
                  │   User Query    │
                  └────────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
  ┌─────────────────────┐     ┌─────────────────────┐
  │ Knowledge Base RAG  │     │  Memory Extraction  │
  │      (Neo4j)        │     │   (Cognee Cloud)    │
  └──────────┬──────────┘     └──────────┬──────────┘
             │                           │
  [Hybrid & Multi-Hop Search]     [Personal Context]
    - Semantic Chunk Vectors        - Verbatim facts
    - Entities & Relationships      - Isolated by User
    - Reciprocal Rank Fusion             │
             │                           │
             └─────────────┬─────────────┘
                           ▼
               ┌───────────────────────┐
               │    Prompt Assembly    │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │    fireworks.ai LLM    │
               │   (Key-Rotated Chain) │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │   Refined Response    │
               └───────────────────────┘
```

---

## Database Architecture (MongoDB)

MongoDB acts as the operational database. Below are the key collections and schemas:

### `apps`
Holds the configuration for custom chat interfaces.
```json
{
  "_id": "ObjectId",
  "id": "app_6c7d8e...",
  "userId": "firebase_user_uid",
  "name": "Customer Support Bot",
  "systemPrompt": "You are a support agent...",
  "model": "accounts/fireworks/models/llama-v3p1-70b-instruct",
  "temperature": 0.7,
  "maxTokens": 1024,
  "linkedKbIds": ["kb_123", "kb_456"],
  "createdAt": "ISOString"
}
```

### `api_keys`
Authenticates public `hypr-sdk` requests.
```json
{
  "_id": "ObjectId",
  "key": "sk_live_123456789...",
  "userId": "firebase_user_uid",
  "name": "Production Server Key",
  "createdAt": "ISOString",
  "expiresAt": "ISOString | null"
}
```

### `app_users`
Keeps track of unique end-users who connect to apps via the SDK.
```json
{
  "_id": "ObjectId",
  "appId": "app_6c7d8e...",
  "userId": "external_user_123",
  "createdAt": "ISOString",
  "lastActiveAt": "ISOString",
  "turnCount": 42
}
```

### `conversations`
Stores chat history for end-users, partitioned by sessions.
```json
{
  "_id": "ObjectId",
  "appId": "app_6c7d8e...",
  "userId": "external_user_123",
  "sessionId": "session_abc",
  "messages": [
    {
      "id": 1719876543210,
      "role": "user",
      "content": "What was that meeting about?",
      "timestamp": "ISOString"
    },
    {
      "id": 1719876543212,
      "role": "assistant",
      "content": "The meeting was regarding...",
      "timestamp": "ISOString"
    }
  ],
  "createdAt": "ISOString",
  "updatedAt": "ISOString"
}
```
