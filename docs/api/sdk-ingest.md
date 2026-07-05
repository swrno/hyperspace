# Public SDK Ingestion API (`POST /api/sdk/ingest`)

This endpoint is the public ingestion gateway for the **`hypr-sdk`** client (`ingestor`). It allows client applications to programmatically feed custom documentation, files, or logs into a target Knowledge Base linked to their Application.

---

## Authentication & Headers

Requires the same triple-key authorization system (`apiKey`, `appId`, `clientId`) as the search query endpoint.

### Header Authentication (Recommended)
```http
X-Api-Key: sk_live_4a5b6c7d8e...
X-App-Id: app_6c7d8e9f0a...
X-Client-Id: firebase_user_uid...
Content-Type: application/json
```

---

## Request Payload

```json
{
  "userId": "end_user_12345",
  "kbId": "kb_development_6c7d8e",
  "text": "All API routes must authenticate with verifySdkAuth. Expired API keys return a 401 response status code.",
  "docName": "Auth Guidelines Draft"
}
```

### Parameter Details

| Field | Type | Required | Description |
| :--- | :---: | :---: | :--- |
| **`userId`** | `string` | **Yes** | Opaque end-user identifier. Used to authorize and log the sync action. |
| **`kbId`** | `string` | **Yes** | Target Knowledge Base ID. Must be listed in the app's `linkedKbIds` array. |
| **`text`** | `string` | **Yes** | The raw text content to parse, chunk, embed, and ingest into the graph. |
| **`docName`** | `string` | No | Human-readable name for the document (e.g. `guide.pdf`). Defaults to `"SDK Ingestion"`. |

---

## Response Payload

```json
{
  "ok": true,
  "chunks": 2,
  "entities": 4
}
```

### Response Field Details

* **`ok`**: Boolean flag indicating if ingestion succeeded.
* **`chunks`**: The quantity of `:Chunk` nodes created after parsing the document text.
* **`entities`**: The quantity of discrete `:Entity` nodes (e.g. key nouns/actions) extracted by the NER parser and linked to the chunks.

---

## Example Request (cURL)

```bash
curl -X POST http://localhost:3000/api/sdk/ingest \
  -H "X-Api-Key: sk_live_YOUR_API_KEY" \
  -H "X-App-Id: app_YOUR_APP_ID" \
  -H "X-Client-Id: YOUR_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_developer_1",
    "kbId": "kb_dev_12345",
    "text": "Sample ingestion text",
    "docName": "Quickstart Guide"
  }'
```

---

## Error Status Codes

| HTTP Status | Error Type | Cause / Resolution |
| :---: | :--- | :--- |
| **400** | Bad Request | Missing `kbId` or empty `text` parameter in the body payload. |
| **401** | Unauthorized | Invalid credential combination. |
| **403** | Forbidden | The target `kbId` is valid but is not linked to the queried application. |
| **500** | Server Error | Graph database query write failed or parser timeout occurred. |
