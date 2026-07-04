# POST /api/sdk/ingest

The endpoint behind `hypr-sdk`'s `ingestor` — adds content to one of the
app's linked Knowledge Bases. This is about the app's shared documents, not
an end-user's personalization Memory (which builds automatically from
conversation — see [`/api/sdk/query`](/api/sdk-query)).

**Auth**: `X-Api-Key` / `X-App-Id` / `X-Client-Id` headers (or the equivalent
body fields), same as [`/api/sdk/query`](/api/sdk-query).

## Request

```jsonc
{
  "userId": "string, required",
  "kbId": "string, required — must be in the app's linkedKbIds",
  "text": "string, required",
  "docName": "string, optional"
}
```

## Response

```jsonc
{
  "ok": true,
  "chunks": "number",
  "entities": "number"
}
```

## Errors

| Status | Meaning |
|---|---|
| 400 | `kbId` or `text` missing |
| 401 | Invalid credentials |
| 403 | `kbId` is not linked to this app |
| 500 | Ingestion failed |
