# Dashboard Analytics API (`GET /api/stats`)

This endpoint calculates real-time aggregates and activity trends across the owner's knowledge graph. It supports both account-wide lookups and individual Knowledge Base scopes.

---

## Authentication & Headers

* **Authentication**: Requires a valid Firebase ID Token passed as a Bearer token in the `Authorization` header.
* **Headers**:
  ```http
  Authorization: Bearer <Firebase_ID_Token>
  ```

---

## Request Queries

### 1. Account-Wide Analytics
Fetch global node counts, timelines, recent events, and external provider connection status across all knowledge bases.
```http
GET /api/stats
```

### 2. Scoped Knowledge Base Insights
Limits counts and timelines to a single Knowledge Base instance. Note that `connections` array metrics are omitted for scoped queries.
```http
GET /api/stats?kbId=kb_development_6c7d8e
```

---

## Response Payload

```json
{
  "total": 1420,
  "documents": 14,
  "knowledgeBases": 3,
  "graph": {
    "nodes": 4512,
    "edges": 12804
  },
  "byType": [
    { "key": "Commit", "n": 620 },
    { "key": "WorkItem", "n": 340 },
    { "key": "Person", "n": 18 },
    { "key": "Document", "n": 14 }
  ],
  "bySource": [
    { "key": "github", "n": 810 },
    { "key": "jira", "n": 596 },
    { "key": "google_drive", "n": 14 }
  ],
  "byStatus": [
    { "key": "Done", "n": 220 },
    { "key": "In Progress", "n": 80 },
    { "key": "To Do", "n": 40 }
  ],
  "timeline": [
    { "date": "2026-06-22", "n": 42 },
    { "date": "2026-06-23", "n": 12 }
  ],
  "recent": [
    {
      "id": "github:commit:sha123456",
      "type": "Commit",
      "source": "github",
      "title": "Resolve merge conflict in memory.ts",
      "url": "https://github.com/...",
      "updatedAt": "2026-07-05T16:00:00.000Z"
    }
  ],
  "connections": [
    {
      "provider": "github",
      "status": "connected",
      "initialSyncStatus": "completed",
      "entityCount": 810,
      "lastSyncAt": "2026-07-05T15:30:00.000Z",
      "account": "swrno",
      "site": null
    }
  ]
}
```

---

## Response Field Details

| Field | Type | Description |
| :--- | :---: | :--- |
| **`total`** | `number` | Count of core domain entities in the graph (excludes raw `:Chunk` text nodes). |
| **`documents`** | `number` | Total number of files and workspace documentation resources ingested. |
| **`knowledgeBases`**| `number` | Total quantity of configured Knowledge Base instances. |
| **`graph`** | `object` | Total node and relationship count including raw text chunks (used for rendering 3D visualizers). |
| **`byType`** | `array` | Breakdown list of node composition grouped by entity classification. |
| **`bySource`** | `array` | Breakdown list of node composition grouped by provider platform. |
| **`byStatus`** | `array` | Distribution of `status` properties for `WorkItem` nodes. |
| **`timeline`** | `array` | 14-day chronological timeline array of counts indicating when items were ingested. |
| **`recent`** | `array` | List of the 8 most recently modified/ingested entities. |
| **`connections`** | `array` | Integration state of GitHub, Jira, and GSuite platforms (global search scope only). |

---

## Fallback Design Strategy

When querying account-wide stats, if the user's Neo4j database does not contain any graphs (common for new accounts before synchronization), the server executes aggregate pipelines against the legacy MongoDB indexing collection `kb_entities`. 

This fallback prevents the dashboard from showing blank states, transitioning to Neo4j queries once the first sync completes.
