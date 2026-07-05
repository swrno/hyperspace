# POST /api/sdk/query

The endpoint behind `hypr-sdk`'s `simpleRetriver` and `hyperRetriever` — see
[hypr-sdk: Getting started](/sdk/getting-started) if you're integrating a
third-party app rather than calling this directly.

**Auth**: `X-Api-Key` / `X-App-Id` / `X-Client-Id` headers (or the equivalent
`apiKey` / `appId` / `clientId` body fields). `apiKey` is resolved to its
owning user first (it's account-level, not per-app — see **API Keys** in
[Applications](/guide/applications)), then `appId`/`clientId` must belong to
an app owned by that same user. See [`lib/sdkAuth.ts`](/guide/applications).

## Request

```jsonc
{
  "userId": "string, required — your own end-user's id",
  "message": "string, required",
  "mode": "simple" | "hyper",  // default "simple"
  "sessionId": "string, default \"default\""
}
```

| `mode` | Knowledge Base retrieval | Memory |
|---|---|---|
| `simple` | single-shot vector lookup per linked KB | not used |
| `hyper` | multi-hop planner + rerank | recalled and updated for this `userId` |

## Response

```jsonc
{
  "response": "string",
  "mode": "simple" | "hyper"
}
```

## Errors

| Status | Meaning |
|---|---|
| 400 | `message` or `userId` missing |
| 401 | `apiKey` invalid/expired, or `appId`/`clientId` don't belong to that key's owner |
| 500 | Generation failed |

Every call appends to the (app, user, session) conversation record; `hyper`
mode also extracts and stores new Memory facts, fire-and-forget.
