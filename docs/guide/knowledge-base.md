# Knowledge Base (Neo4j GraphRAG)

The **Knowledge Base** is `hypr`'s shared, graph-structured store of corporate documentation, repository metadata, code changes, issues, and sync activities. It is backed by **Neo4j** and implemented in `web/api/cognee.ts` and `web/api/lib/neo4j.ts`.

---

## Detailed Graph Schema

`hypr` represents documents and integrations as nodes in a unified knowledge graph. This enables cross-platform semantic search (e.g., matching a Jira ticket with a GitHub commit based on their shared entity relationships).

```
┌────────────────────────────────────────────────────────┐
│                   (:KnowledgeBase)                     │
│                    {kb_id, name}                       │
└───────┬───────────────────────────────┬────────────────┘
        │                               │
        │ -[:HAS_DOC]->                 │ -[:HAS_REPO]->
        ▼                               ▼
  (:Document)                       (:Repo)
  {kb_id, name}                     {id, name, owner}
        │                               │
        │ -[:HAS_CHUNK]->               ├─ -[:HAS_PR]-> (:PR)
        ▼                               ├─ -[:HAS_ISSUE]-> (:Issue)
     (:Chunk)                           ├─ -[:HAS_COMMIT]-> (:Commit)
 {chunk_id, content,                    └─ -[:HAS_FILE]-> (:File)
  embedding}                            
        │
        │ -[:HAS_ENTITY]->
        ▼
    (:Entity)
 {name, description,
  type, embedding}
        │
        │ -[:RELATES_TO {description}]-> (:Entity)
```

### Isolation Keys
Every node carries `userId` (the workspace owner's ID) and `kb_id` (the specific knowledge base it belongs to). This layout ensures multi-tenant isolation within a single Neo4j database instance.

### Consistent Identifiers (URNs)
Node IDs for structured tools follow a deterministic Uniform Resource Name format:
`"<source>:<type>:<externalId>"` (e.g., `github:issue:1024` or `jira:ticket:PROJ-456`). This format allows fast, index-free identification of the originating platform and item type when building stats or rendering the graph.

---

## Database Indexes

To maintain sub-second search times, `hypr` bootstraps Neo4j constraints and indices on startup:

1. **Unique Constraints**:
   - Ensures uniqueness of `id` properties on `:Document`, `:Repo`, `:PR`, `:Issue`, `:Commit`, `:File`, `:Entity`, and `:Chunk` scoped to `kb_id`.
2. **Vector Index (`vector_index`)**:
   - Configured on `(:Chunk {embedding})` and `(:Entity {embedding})` using cosine similarity over 384-dimensional vectors.
3. **Full-Text Index (`fulltext_index`)**:
   - Configured on text properties of chunk and entity nodes to handle exact matches, ticket numbers (e.g. `PROJ-123`), and short strings.

---

## Search & Retrieval Algorithms

`hypr` implements four retrieval algorithms to balance latency, recall quality, and reasoning depth:

### 1. Vector Search (`vectorSearch`)
- **Mechanism**: Calculates cosine similarity between the query embedding (produced by `all-MiniLM-L6-v2`) and chunk/entity vector properties.
- **Use Case**: Fast retrieval of semantic concepts.

### 2. Graph Search (`graphSearch`)
- **Mechanism**: Finds matching entities using full-text indexes, then traverses relationships to pull neighboring nodes (one-hop depth).
- **Use Case**: Connecting related topics (e.g. finding a developer linked to a specific code file).

### 3. Hybrid Search (`hybridSearch`)
- **Mechanism**: Runs vector and graph search in parallel, merges their result lists using **Reciprocal Rank Fusion (RRF)**, and reranks the unified set using Fireworks' Qwen-based reranker.
- **RRF Formula**:
  $$RRF\_Score(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$
  *(where $k = 60$, and $r_m(d)$ is the rank of document $d$ in retriever $m$)*
- **Use Case**: Standard search strategy for high-relevance retrieval.

### 4. Multi-Hop Search (`multiHopSearch`)
- **Mechanism**: Passes the query to a planner model which decomposes it into sub-questions. It runs `hybridSearch` for each sub-question, collects the context blocks, and removes duplicates.
- **Use Case**: High-reasoning questions (e.g., "Find all PRs associated with tickets completed last week").

---

## Live Performance Analytics

The dashboard metrics endpoint (`GET /api/stats?kbId=`) compiles statistics by running real-time Cypher aggregations. 

Example Cypher query for source breakdown:
```cypher
MATCH (n {kb_id: $kbId})
WHERE n.source IS NOT NULL
RETURN n.source AS key, count(n) AS n
ORDER BY n DESC
```
This ensures analytics are immediate, eliminating the need for out-of-sync caching tables.
