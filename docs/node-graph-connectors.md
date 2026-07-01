# Node-Graph Connector Scaffolding (Google Docs / Slides / Jira / Calendar)

## What this is

An **additive** ingestion pipeline that builds a
`KnowledgeBase → Source → Chunk → Entity → (RELATES_TO) → Entity` node graph for
Google Docs (`gdocs`), Google Slides (`gslides`), Jira (`jira`), and Google
Calendar (`gcal`).

It runs **alongside** — never replacing — the existing pipeline
(`snapshot()` → Mongo `kb_entities` → `entitiesToDocument()` → Cognee/Neo4j),
which continues to power chat retrieval unchanged. The new graph is persisted to
two new Mongo collections and exposed read-only via the graph API.

## Why additive

`google.ts` and `jira.ts` were **not** stubs — they already had working
`snapshot()`/`pollSince()` functions feeding the live Cognee/chat pipeline.
Rewriting their `snapshot()` to the new node shapes would have silently broken
chat retrieval for these four platforms, and the fix would require touching
off-limits files (`cognee.ts`, `retrieval.ts`, `chat.ts`). So the new model was
built as a second, parallel structure that leaves the existing flow byte-for-byte
intact.

**Accepted trade-off:** API/embedding/NER calls roughly double for these four
platforms (once for each pipeline). Unavoidable without touching the off-limits
files.

## Data model

```
KnowledgeBase
  └─[HAS_SOURCE]──► Source            (Document / Presentation / Project / Calendar)
                      └─[HAS_CHUNK]──► Chunk   (Chunk / Slide / Issue / CalendarEvent)
                                         └─[HAS_ENTITY]──► Entity
                                                              └─[RELATES_TO]──► Entity
```

### Mongo collections

| Collection | `_id` | Contents |
|---|---|---|
| `kb_nodes` | node's own globally-unique id (e.g. `gdocs::{fileId}`, `jira::issue::{id}`, `entity::{slug}`) | `{ id, type, title, body, metadata, kbId, userId, ingestedAt }` |
| `kb_edges` | `{kbId}::{source}::{target}::{label}` | `{ source, target, label, description?, kbId, userId, ingestedAt }` |

### `kbId` stand-in

`ingest.ts`'s `runInitialSync` has no real Knowledge Base concept (that lives in
the off-limits `kb.ts`). `userId` is passed as the `kbId` stand-in throughout —
query these collections by `kbId: <userId>` until real KB scoping is wired.

## Files changed

| File | Change |
|---|---|
| `web/api/lib/schema.ts` | Node normalizers (`normalizeDocument`, `normalizeChunk`, `normalizePresentation`, `normalizeSlide`, `normalizeJiraProjectNode`, `normalizeJiraIssueNode`, `normalizeCalendarNode`, `normalizeCalendarEventNode`, `normalizeExtractedEntity`), paragraph-aware `chunkText`, `extractAdfText` (wraps existing ADF flattener) |
| `web/api/lib/google.ts` | `gdocsNodeSnapshot`, `gslidesNodeSnapshot` (Slides API text extraction), `gcalNodeSnapshot` (fully paginated via `nextPageToken`) |
| `web/api/lib/jira.ts` | `jiraNodeSnapshot` + `paginateAll` (uncapped pagination), full comment/issue-link fetch, ADF comment parsing |
| `web/api/lib/graphbuild.ts` | `NODE_GRAPH_EDGES` constants + `buildNodeGraphEdges()` (pure edge assembler) |
| `web/api/ingest.ts` | Groq-based NER (`extractEntitiesForNode`), entity co-occurrence + Jira linked-issue `RELATES_TO` edges, dedup + batched embeddings, `upsertNodeGraph`, `buildNodeGraphForProvider` (fire-and-forget after `persistAndIngest` in `runInitialSync`) |
| `web/api/graph.ts` | Read route: `mode=nodes` branch (add-only) |

### Naming collisions resolved

`schema.ts` already exported `normalizeJiraIssue`/`normalizeCalendarEvent` (used by
the live pipeline). The new functions are suffixed `…Node`
(`normalizeJiraIssueNode`, `normalizeJiraProjectNode`, `normalizeCalendarNode`,
`normalizeCalendarEventNode`) to avoid clashing.

## Entity extraction

- **gdocs / gslides / jira** — LLM NER over each chunk/slide/issue's text via Groq
  (`llama-3.1-8b-instant`), producing `Entity` nodes + `HAS_ENTITY` edges.
- **gcal** — structured, no LLM: attendees → `Entity(People)`, location →
  `Entity(Location)`, created directly from event fields.
- **RELATES_TO** — entities co-occurring in the same NER call are linked
  (`co-occurs in {source_title}`); Jira `linked_issues` link the two issue nodes
  (`{relationship}`, e.g. `blocks`).

### Efficiency

- Embeddings are batched via `embedBatch` (concurrency + rate-limit pacing)
  rather than one-at-a-time.
- Entity nodes are deduped by id before embedding/upsert — an entity appearing in
  N chunks is one node + one embed call, while keeping its N `HAS_ENTITY` edges.

## Read API

```
GET /api/graph?mode=nodes&kbId=<userId>&platform=<optional>
```

Exposed as a `mode` branch (not a separate `/api/graph/nodes` path) because
`server.ts` registers only `app.all('/api/graph', …)` and is off-limits to change.

**Response:**

```json
{
  "nodes": [{ "id": "...", "type": "...", "title": "...", "body": "...", "metadata": { } }],
  "edges": [{ "source": "...", "target": "...", "label": "...", "description": "..." }],
  "stats": { "nodeCount": 0, "edgeCount": 0, "byType": { "chunk": 0 } },
  "mode": "nodes"
}
```

- Scoped by the **authenticated `userId`**, never a raw `kbId` param (prevents
  reading another user's nodes; equivalent since `kbId === userId` today).
- Strips internal fields and the large `embedding` vectors from `metadata`.
- Caps at 2000 nodes / 5000 edges (`console.warn` on truncation); drops dangling
  edges whose endpoints fall outside the node cap.

## Constraints honoured

- **GitHub connector never touched** (`lib/github.ts` and all GitHub branches).
- Off-limits files untouched: `auth.ts`, `oauth.ts`, `mongodb.ts`,
  `connections.ts`, `server.ts`, `cognee.ts`, `retrieval.ts`, `chat.ts`, `kb.ts`,
  `connectors.ts`. (`graph.ts` was later explicitly authorized, add-only, for the
  read route.)
- No new npm packages.

## Verification

- `npm run typecheck` — clean except one pre-existing, unrelated error in
  `graph.ts` (a `degree` typing issue in the untouched `mode=cognee` branch).
- `npm run build` — passes.
- 22-assertion throwaway script exercised the pure functions (chunking, ADF
  flattening, slide empty-content fallback, Jira link extraction, entity-id slug
  determinism, edge assembly + dedup) — all passing.
- No live-token integration test is possible without real Google/Jira OAuth
  connections; new fetch helpers were kept textually parallel to the existing
  battle-tested ones to narrow risk to URL/param correctness.

## Not done (future work)

1. Wire `retrieval.ts`/`chat.ts` to query `kb_nodes`/`kb_edges` so the richer
   graph influences chat answers.
2. Delta sync for the node graph (`jiraNodePollSince` + Google equivalents).
3. Replace the `kbId = userId` stand-in with real KB ids from `kb.ts`.
