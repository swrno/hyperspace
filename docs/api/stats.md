# GET /api/stats

Live Dashboard / Insights aggregates, computed directly from Neo4j via Cypher
(`getUserGraphStats()`) — see [Knowledge Base: Dashboard & Insights](/guide/knowledge-base#dashboard-insights).
Falls back to a legacy MongoDB index only for accounts that predate the graph
pipeline and have no Neo4j data yet.

**Auth**: `Authorization: Bearer <Firebase ID token>`

## Request

```
GET /api/stats                 → account-wide, every knowledge base
GET /api/stats?kbId=<id>       → scoped to one knowledge base
```

## Response

```jsonc
{
  "total": "number",                          // entities, excluding raw text chunks
  "documents": "number",
  "knowledgeBases": "number",
  "graph": { "nodes": "number", "edges": "number" },  // full graph size, including chunks
  "byType":   [{ "key": "string", "n": "number" }],   // e.g. Commit, WorkItem, Person, Document
  "bySource": [{ "key": "string", "n": "number" }],   // e.g. github, knowledge_graph, kb
  "byStatus": [{ "key": "string", "n": "number" }],
  "timeline": [{ "date": "YYYY-MM-DD", "n": "number" }], // last 14 days
  "recent":   [{ "id": "string", "type": "string", "source": "string", "title": "string", "url": "string?", "updatedAt": "string?" }],
  "connections": [{ "provider": "string", "status": "string", "initialSyncStatus": "string", "entityCount": "number", "lastSyncAt": "string | null" }]
}
```

`connections` is only present for the account-wide call (it lists connected
platforms like GitHub/Jira, unrelated to a single KB).
