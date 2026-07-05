# Public SDK Query API (`POST /api/sdk/query`)

This endpoint is the public query gateway for **`hypr-sdk`** clients (`simpleRetriever` and `hyperRetriever`). It is designed for third-party backend servers to query knowledge systems and personal memory on behalf of their end-users.

---

## Authentication & Headers

Unlike admin-facing endpoints that require Firebase tokens, the public SDK endpoint uses a triple-key authentication system (`apiKey`, `appId`, `clientId`). 

You can provide these keys using HTTP request headers (recommended) or pass them in the JSON body.

### Header Authentication (Recommended)
```http
X-Api-Key: sk_live_4a5b6c7d8e...
X-App-Id: app_6c7d8e9f0a...
X-Client-Id: firebase_user_uid...
Content-Type: application/json
```

### Body Authentication
Alternatively, omit the custom headers and include `apiKey`, `appId`, and `clientId` directly in the JSON root of the payload.

---

## Request Payload

```json
{
  "userId": "end_user_12345",
  "message": "Verify the latest security changes in the auth library.",
  "mode": "hyper",
  "sessionId": "session_security_check",
  "personalisation": true
}
```

### Parameter Details

| Field | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| **`userId`** | `string` | **Yes** | — | Unique, opaque identifier of your end-user. Used to isolate conversation logs and personal memory. |
| **`message`** | `string` | **Yes** | — | The query text. |
| **`mode`** | `string` | No | `"simple"` | Search depth: `"simple"` (fast vector search) or `"hyper"` (multi-hop planner + reranking). |
| **`sessionId`** | `string` | No | `"default"` | Identifies the unique conversation thread. |
| **`personalisation`**| `boolean`| No | *Depends* | Toggles Cognee memory recall/write independently of search mode. True by default for `hyper`. |

---

## Response Payload

```json
{
  "response": "The recent security patches updated the token validation expiration constraint in `web/api/auth.ts`.",
  "mode": "hyper"
}
```

### Response Field Details

* **`response`**: The model's final, grounding-synthesized answer text.
* **`mode`**: The search depth executed for the query.

---

## Example Request (cURL)

```bash
curl -X POST http://localhost:3000/api/sdk/query \
  -H "X-Api-Key: sk_live_YOUR_API_KEY" \
  -H "X-App-Id: app_YOUR_APP_ID" \
  -H "X-Client-Id: YOUR_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_developer_1",
    "message": "What repositories do you have access to?",
    "mode": "simple"
  }'
```

---

## Error Status Codes

| HTTP Status | Error Type | Cause / Resolution |
| :---: | :--- | :--- |
| **400** | Bad Request | Missing the `message` parameter or `userId` parameter. |
| **401** | Unauthorized | The `apiKey` is invalid or expired, or the `appId`/`clientId` do not match the owner. |
| **500** | Server Error | In-process embedding failure or downstream LLM error. |
