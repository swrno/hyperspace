# Node-Graph Connector Scaffolding (Google Docs / Slides / Jira / Calendar)

## What this is

An **additive** ingestion pipeline that builds a
`KnowledgeBase → Source → Chunk → Entity → (RELATES_TO) → Entity` node graph for
Google Docs (`gdocs`), Google Slides (`gslides`), Jira (`jira`), and Google
Calendar (`gcal`).

It runs **alongside** — never replacing — the existing pipeline
(`snapshot()` → Mongo `kb_entities` → `entitiesToDocument()` → Cognee/Neo4j).
The new graph is persisted to two new Mongo collections, consumed by chat
retrieval, and exposed read-only via the graph API.

## Role: permanent instant-retrieval cache (sidecar to Cognee)

**Cognee/Neo4j is the source of truth** — it holds every connector (GitHub, Jira,
Google) plus KB documents, unified per user. But Cognee isn't tightly user-scoped
and indexes **asynchronously**, so freshly connected data isn't answerable for a
while (see [`retrieval.ts`](../web/api/retrieval.ts)).

`kb_nodes`/`kb_edges` is the fix: a **rebuildable, user-scoped cache** that grounds
chat *instantly*, before Cognee catches up, and exposes an explicit
`Source→Chunk→Entity→RELATES_TO` structure you can query/render without going
through Cognee's LLM extractor. It is **not** a second source of truth — it can be
dropped and rebuilt from the connectors at any time. GitHub deliberately stays out
of this cache (its instant grounding comes from `kb_entities`); the cache covers
gdocs/gslides/jira/gcal.

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

### `kbId`: real ids + stand-in

Two paths populate the graph with different `kbId`s:

- **Real KB id** — when a source is attached to a Knowledge Base
  (`kb.ts`'s `attach-source` action), the graph is built keyed by the real
  `knowledge_bases._id`. This is how a KB-scoped chat sees only its own graph.
- **`userId` stand-in** — the global connect/delta path (`runInitialSync` /
  `runDeltaSync`) has no KB context, so it still passes `userId` as `kbId`.

Query these collections by the relevant `kbId` (a real KB id, or `<userId>` for
the global path).

## Files changed

| File | Change |
|---|---|
| `web/api/lib/schema.ts` | Node normalizers (`normalizeDocument`, `normalizeChunk`, `normalizePresentation`, `normalizeSlide`, `normalizeJiraProjectNode`, `normalizeJiraIssueNode`, `normalizeCalendarNode`, `normalizeCalendarEventNode`, `normalizeExtractedEntity`), paragraph-aware `chunkText`, `extractAdfText` (wraps existing ADF flattener) |
| `web/api/lib/google.ts` | `gdocsNodeSnapshot`, `gslidesNodeSnapshot` (Slides API text extraction), `gcalNodeSnapshot` (fully paginated via `nextPageToken`); **delta**: optional `sinceIso` — `filterModifiedSince` (Drive `modifiedTime`) for docs/slides, `updatedMin` for calendar |
| `web/api/lib/jira.ts` | `jiraNodeSnapshot` + `paginateAll` (uncapped pagination), full comment/issue-link fetch, ADF comment parsing; **delta**: optional `sinceIso` via shared `jqlSince` helper (`updated >=` per-project JQL) |
| `web/api/lib/graphbuild.ts` | `NODE_GRAPH_EDGES` constants + `buildNodeGraphEdges()` (pure edge assembler) |
| `web/api/ingest.ts` | Groq-based NER (`extractEntitiesForNode`), entity co-occurrence + Jira linked-issue `RELATES_TO` edges, dedup + batched embeddings, `upsertNodeGraph`, exported `buildNodeGraphForProvider` (optional `since`); delta wired into `runDeltaSync` (jira) + `syncUser` (google, via `runInitialSync`'s `nodeGraphSince`) |
| `web/api/graph.ts` | Read route: `mode=nodes` branch (add-only) |
| `web/api/retrieval.ts` | `retrieveNodeGraphContext` — keyword-scored `kb_nodes` content + 1-hop `kb_edges` entities/relations (add-only) |
| `web/api/chat.ts` | Node-graph context folded into both grounding branches (global + KB-scoped, real `kbId`) |
| `web/api/kb.ts` | `attach-source` fires a real-`kbId` node-graph build for gdocs/gslides/jira/gcal (add-only) |

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
  reading another user's nodes).
- Strips internal fields and the large `embedding` vectors from `metadata`.
- Caps at 2000 nodes / 5000 edges (`console.warn` on truncation); drops dangling
  edges whose endpoints fall outside the node cap.

## Retrieval & delta sync

**Chat consumption.** `retrieveNodeGraphContext` (in `retrieval.ts`) keyword-scores
content nodes (`document`/`chunk`/`slide`/`presentation`/`jira_issue`/…) in
`kb_nodes`, attaches each pick's 1-hop `HAS_ENTITY`/`RELATES_TO` neighbours from
`kb_edges`, and strips embeddings. `chat.ts` folds it into both grounding
branches: the global hybrid retrieval (`userId`-scoped) and the KB-scoped branch
(real `kbId`).

**Delta sync.** Reuses the existing `connection.lastPollCursor` (no
`connections.ts` change); upserts are idempotent so a delta only narrows what's
fetched:

- **jira** — `updated >=` JQL, wired into `runDeltaSync` (fire-and-forget).
- **gcal** — Calendar `updatedMin`.
- **gdocs / gslides** — Drive has no cheap changes API here, so
  `filterModifiedSince` gates selected files by `modifiedTime` (fail-open on a
  metadata error). Wired through `syncUser`'s "Sync now" google path.

**Limitation:** delta upserts add/update nodes but never delete stale ones (no
tombstoning) — the same trade-off the live pipeline already accepts.

## Constraints honoured

- **GitHub connector never touched** (`lib/github.ts` and all GitHub branches).
- Off-limits files untouched: `auth.ts`, `oauth.ts`, `mongodb.ts`,
  `connections.ts`, `server.ts`, `cognee.ts`, `connectors.ts`. (`graph.ts`, and
  later `retrieval.ts` / `chat.ts` / `kb.ts`, were explicitly authorized,
  add-only, for the retrieval-wiring work.)
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

## Implemented (previously "future work")

1. ✅ `retrieval.ts`/`chat.ts` query `kb_nodes`/`kb_edges` — the richer graph now
   influences chat answers (see **Retrieval & delta sync**).
2. ✅ Delta sync for the node graph — jira (`updated >=`), gcal (`updatedMin`),
   gdocs/gslides (Drive `modifiedTime` filter).
3. ✅ Real KB ids — `kb.ts`'s `attach-source` builds the graph keyed by the real
   `knowledge_bases._id`; the global connect/delta path keeps the `userId`
   stand-in.

### Still open

- No tombstoning: delta never deletes stale nodes/edges.
- The global connect path still uses the `userId` stand-in (only attach-source
  carries a real KB id).
