# Workspace Owner Chat API (`POST /api/chat`)

This endpoint powers the workspace owner's chat assistant. It routes user questions through the workspace's Knowledge Bases (global or single KB scope) and retrieves context-aware replies using the selected retrieval mode.

It automatically evaluates inputs against the Person-Specific Information (PSI) rules to save user facts into Cognee Memory and personalizes responses accordingly.

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
  "message": "Find the main repository branch name for hyperspace and summarise its latest commit.",
  "history": [
    {
      "role": "user",
      "content": "Hello, I am the lead developer for the hyperspace project."
    },
    {
      "role": "assistant",
      "content": "Welcome! I've noted your role. How can I help you manage your repositories today?"
    }
  ],
  "mode": "deep",
  "kbId": "kb_development_6c7d8e"
}
```

### Parameter Details

| Field | Type | Required | Description |
| :--- | :---: | :---: | :--- |
| **`message`** | `string` | **Yes** | The active chat message. Analyzed for personalization facts via regex if matching key declarations. |
| **`history`** | `array` | No | A list of historical conversation messages formatted as `{ role, content }`. Supported roles: `user`, `assistant`. |
| **`mode`** | `string` | No | Retrieval depth. Choices: `normal` (hybrid search, fast) or `deep` (multi-hop reasoning planner). Defaults to `normal`. |
| **`kbId`** | `string` | No | Scopes the search query to a single Knowledge Base. If omitted, retrieval spans all Knowledge Bases owned by the account. |

---

## Response Payload

```json
{
  "response": "The main repository branch for `swrno/hyperspace` is `main`. The latest commit resolved a Neo4j merge conflict in the Cognee memory connector file.",
  "reasoning": "1. Search query: 'hyperspace repository branch and latest commit'\n2. Identified Repo: 'github:repo:swrno/hyperspace'\n3. Queried latest commit details in knowledge base.\n4. Extracted branch details from metadata.",
  "title": "Hyperspace Repository Setup",
  "retrievalMode": "deep"
}
```

### Response Field Details

* **`response`**: The final markdown response synthesized by the model. 
* **`reasoning`**: The model's chain-of-thought process, isolated from the final answer to prevent drafting leaks.
* **`title`**: A short 3–5 word conversation title. Generated only on the first turn of a conversation thread.
* **`retrievalMode`**: The resolved retrieval strategy used for the query.

---

## Example Request (cURL)

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Who is the lead developer of hyperspace?",
    "mode": "normal"
  }'
```

---

## Error Codes

| HTTP Status | Error Type | Cause / Resolution |
| :---: | :--- | :--- |
| **400** | Bad Request | Missing the `message` property or empty message body. |
| **418** | Unauthorized | Firebase ID Token validation failed or token has expired. |
| **429** | Too Many Requests | The account has exceeded its hourly request limit. |
| **500** | Internal Server Error | All Fireworks provider keys failed, or a database timeout occurred. |
