# Playground App Chat API (`POST /api/app-chat`)

This endpoint powers the **Playground** interface inside the Admin Dashboard. It allows workspace owners to test and run queries against their specific Applications using custom prompts, temperatures, and model scopes.

It retrieves content from the subset of Knowledge Bases linked to the Application and optionally personalizes answers using simulated end-user profiles.

---

## Authentication & Headers

* **Authentication**: Requires a valid Firebase ID Token passed as a Bearer token in the `Authorization` header.
* **Headers**:
  ```http
  Authorization: Bearer <Firebase_ID_Token>
  Content-Type: application/json
  ```

---

## Request Payload

```json
{
  "appId": "app_6c7d8e9f0a",
  "message": "Verify the project release timeline.",
  "systemPrompt": "You are a timeline validator. Evaluate facts strictly.",
  "model": "accounts/fireworks/models/llama-v3p1-70b-instruct",
  "searchMode": "deep",
  "temperature": 0.5,
  "maxTokens": 512,
  "topP": 0.9,
  "history": [],
  "linkedKbIds": ["kb_development_123"],
  "sessionId": "session_playground_test",
  "endUserId": "end_user_sim_01"
}
```

### Parameter Details

| Field | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| **`appId`** | `string` | **Yes** | — | Unique identifier of the app to query. |
| **`message`** | `string` | **Yes** | — | The active query text. |
| **`systemPrompt`**| `string` | No | *Saved app prompt* | Overrides the application's default system instructions for this turn. |
| **`model`** | `string` | No | *Saved app model* | Specifying a Fireworks model identifier overrides the primary model chain for this turn. |
| **`searchMode`** | `string` | No | `"normal"` | Search depth: `"normal"`, `"hyper"` (reranked), or `"deep"` (multi-hop). |
| **`temperature`** | `number` | No | `0.7` | Sampling temperature between `0` and `2`. |
| **`maxTokens`** | `number` | No | `1024` | The maximum generation budget token limit. |
| **`topP`** | `number` | No | `1.0` | Nucleus sampling probability parameter. |
| **`history`** | `array` | No | `[]` | Message list formatted as `{ role, content }` objects. |
| **`linkedKbIds`** | `array` | No | `[]` | Scopes queries strictly to these Knowledge Base IDs. |
| **`sessionId`** | `string` | No | `"default"` | Identifies the simulation thread. |
| **`endUserId`** | `string` | No | *`sessionId`* | Simulates a specific end-user for testing personalization memory. |

---

## Response Payload

```json
{
  "userMessage": {
    "id": 1719876543210,
    "role": "user",
    "content": "Verify the project release timeline.",
    "timestamp": "2026-07-05T16:00:00.000Z",
    "sessionId": "session_playground_test"
  },
  "aiMessage": {
    "id": 1719876543212,
    "role": "assistant",
    "content": "The project timeline is scheduled for code completion by August 15th.",
    "reasoning": "1. Scanned doc metadata. 2. Matched timeline items.",
    "timestamp": "2026-07-05T16:00:02.000Z",
    "sessionId": "session_playground_test"
  }
}
```

---

## Logging & Side Effects

1. **Global App Logs**: Message structures are pushed into the application's top-level document arrays (`apps.messages`) in MongoDB.
2. **User Conversations**: Conversations are recorded in the `conversations` collection, isolating histories by `(appId, endUserId, sessionId)`.
3. **Personalization Memory**: If `searchMode` is `"deep"` or `personalisation: true` is passed, the request automatically updates Cognee memory for the target `endUserId`.
