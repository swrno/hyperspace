# Memory (Cognee Personalization)

**Memory** is the system responsible for per-end-user personalization. It automatically extracts key facts from conversations and recalls them on subsequent turns, creating a continuous interaction flow across sessions.

Unlike the [Knowledge Base](/guide/knowledge-base), which handles shared document indexing via Neo4j, Memory is completely decentralized and isolated. It operates without local indexes or processes, calling an external **Cognee Cloud** tenant over plain HTTP (`web/api/lib/cogneeMemory.ts`).

---

## Strict Tenant Isolation

To guarantee user privacy and data separation, each end-user is assigned an isolated Cognee **dataset namespace**:
`hypr_user_<sanitizedUserId>`

We sanitize the user identifier to protect the partition namespace from injection:
```ts
function datasetForUser(userId: string): string {
  return `hypr_user_${String(userId || 'anon').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}
```

By querying and saving explicitly into this dataset namespace, there is no shared index. One user's recalled context can never access or contain facts belonging to another user.

---

## API Specifications & Payloads

Memory operations interface directly with Cognee Cloud's REST endpoints:

### 1. Ingestion (`/api/v1/remember`)
Triggered as a fire-and-forget task in the background. It takes raw text, treats it as a text file, and sends it as multipart form-data.

* **Endpoint**: `POST ${COGNEE_BASE_URL}/api/v1/remember`
* **Headers**:
  ```http
  X-Api-Key: <COGNEE_API_KEY>
  ```
* **Body (Multipart Form-Data)**:
  - `datasetName`: `hypr_user_<userId>`
  - `data`: Text file blob containing user statements.

---

### 2. Retrieval (`/api/v1/search`)
Queries Cognee's search engine to pull facts relevant to the user's active query.

* **Endpoint**: `POST ${COGNEE_BASE_URL}/api/v1/search`
* **Headers**:
  ```http
  X-Api-Key: <COGNEE_API_KEY>
  │Content-Type: application/json
  ```
* **Body (JSON)**:
  ```json
  {
    "query": "User query here",
    "datasets": ["hypr_user_12345"],
    "searchType": "GRAPH_COMPLETION",
    "topK": 5,
    "maxIter": 3,
    "sessionId": "session_abc"
  }
  ```

---

## Timeout & Abort Handling

Memory retrieval is treated as a best-effort, non-blocking feature. If Cognee Cloud experiences cold-starts or network latency, the query is automatically aborted so that the chat turn response is not delayed.

We enforce this using `AbortController` and `Promise.race`:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8000); // 8s hard gateway cap

const res = await fetch(`${url}/api/v1/search`, {
  method: 'POST',
  body: JSON.stringify({ ... }),
  signal: controller.signal
});
```

---

## Person-Specific Information (PSI) Trigger

For owner-facing chats, we avoid flooding the Cognee memory dataset with general search queries. We use a regex trigger (`PSI_RE`) to ensure only declarative statements about identity, preferences, roles, or setups are sent for ingestion:

```ts
const PSI_RE = /\b(i am|i'm|i've|i have|my name|call me|i prefer|i like|i love|i hate|i don'?t|i use|i work|i'm working|i'm building|i focus|i need|i want|my role|my job|my team|my manager|my company|my project|my email|my stack|my goal|our team|our product|our company|we use|we are|we're|based in|i live|i'm responsible|only show|remember that|remember i|note that|keep in mind|for future|going forward)\b/i;
```

---

## Wiring Integration Map

| Interface Endpoint | Recalls Memory? | Writes Memory? | Condition |
| :--- | :---: | :---: | :--- |
| **`/api/chat`** | Yes | Yes | Writes only if the user message matches `PSI_RE`. |
| **`/api/app-chat`** | Yes | Yes | Writes automatically after every turn in the playground. |
| **`/api/sdk/query`** (`mode: 'simple'`) | No | No | Optional; writes/recalls only if `personalisation: true` is passed. |
| **`/api/sdk/query`** (`mode: 'hyper'`) | Yes | Yes | Yes, automatically on every message/response pair. |
