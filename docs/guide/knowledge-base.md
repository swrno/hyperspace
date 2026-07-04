# Knowledge Base (Neo4j)

The Knowledge Base is hypr's shared, graph-structured store of an app's
documents, code, and connected-tool data. It is backed by Neo4j and lives
entirely in `web/api/cognee.ts` (the filename is a historical holdover — this
is a from-scratch Neo4j implementation, not the Cognee product; see
[Memory](/guide/memory) for the real Cognee integration).

## Graph schema

```
(:KnowledgeBase {kb_id, name})
  -[:HAS_DOC]->      (:Document  {kb_id, name})
                         -[:HAS_CHUNK]-> (:Chunk {chunk_id, chunk_text_content, embedding})
                                            -[:HAS_ENTITY]-> (:Entity {name, description, embedding, type})
  -[:HAS_REPO]->     (:Repo {id, name, owner, kb_id})
                         -[:HAS_PR]->      (:PR      {id, number, title, embedding, kb_id})
                         -[:HAS_ISSUE]->   (:Issue   {id, number, title, embedding, kb_id})
                         -[:HAS_COMMIT]->  (:Commit  {id, sha, embedding, kb_id})
                         -[:HAS_FILE]->    (:File    {id, embedding, kb_id})
  -[:HAS_CALENDAR]-> (:Calendar {id, kb_id})
                         -[:HAS_EVENT]->   (:CalendarEvent {id, kb_id})

(:Entity)-[:RELATES_TO {description}]->(:Entity)
```

Every node carries a `userId` (the app owner) and `kb_id` (which knowledge
base it belongs to) — that pair is how a KB's data stays isolated from every
other KB on the same Neo4j instance.

`Repo`/`PR`/`Issue`/`Commit`/`File`/`Calendar`/`CalendarEvent` node ids follow
`"<source>:<type>:<externalId>"` (see `lib/schema.ts`'s `eid()`), so the
originating platform and domain type can be read straight off the id — this
is what powers the Dashboard's "by source" / "by type" breakdowns without a
separate lookup table.

## Retrieval

Three retrieval primitives, all in `cognee.ts`:

| Function | What it does |
|---|---|
| `graphSearch` | Full-text search over chunks + one hop of related entities. Fast, single query. |
| `vectorSearch` | Cosine similarity over chunk embeddings (local `all-MiniLM-L6-v2`). |
| `hybridSearch` | Runs both, merges via reciprocal rank fusion, then reranks the merged set with Fireworks' `qwen3-reranker-8b`. |
| `multiHopSearch` | A planner model decomposes the query into sub-questions, runs `hybridSearch` per sub-question, dedupes. |

Which of these a chat turn uses depends on [search mode](/guide/search-modes).

## Dashboard & Insights

`GET /api/stats` (account-wide) and `GET /api/stats?kbId=<id>` (one KB) both
call `getUserGraphStats()`, which runs live Cypher aggregates — node/edge
counts, composition by type, by source, a 14-day ingestion timeline, and
recent activity — directly against Neo4j. There is no separate analytics
cache; the numbers you see are the graph as of the request.
