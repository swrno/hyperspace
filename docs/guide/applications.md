# Applications

An **Application** is a named, configured chatbot an owner builds inside
hypr: a system prompt, a model, temperature/maxTokens, and zero or more
linked Knowledge Bases. It's created via `POST /api/apps` (`web/api/apps.ts`),
which generates two identifiers on the app document:

| Field | Format | Purpose |
|---|---|---|
| `appId` | `app_<hex>` | Identifies which app a request is for. |
| `clientId` | the app owner's Firebase `uid` | Public identifier paired with `apiKey`. |

`apiKey` (`sk_live_<hex>`) is *not* generated per app — it's created and
managed separately, under the owner's account, via **API Keys**
(`POST /api/api-keys`, `web/api/api-keys.ts`). A user can hold multiple keys,
and any one of them authenticates `hypr-sdk` calls for any app that user
owns; `web/api/lib/sdkAuth.ts` resolves `apiKey` → owning user, then checks
that user owns `appId`/`clientId`.

Together, `apiKey` + `appId` + `clientId` authenticate every `hypr-sdk` call
(see [hypr-sdk: Getting started](/sdk/getting-started)) — this is a
*different* auth path from the owner's own Firebase login used everywhere
else (`web/api/auth.ts`, `verifyToken()`).

## Two ways to talk to an app

- **Playground** (`POST /api/app-chat`, Firebase-authenticated) — the owner
  testing their own app. Has a "search mode" and "model" picker per message.
- **hypr-sdk** (`POST /api/sdk/query`, apiKey/appId/clientId-authenticated) —
  a real third-party integration, on behalf of the app's own end-users.

Both paths run the same underlying retrieval + generation logic; they differ
only in how the caller is authenticated and whose Memory gets personalized.

## End-user data

Every `hypr-sdk` caller supplies its own `userId` — an opaque string from
the calling system, meaningful only to it. hypr never sees more than that
string. Two collections track this, both in `web/api/lib/appUsers.ts`:

```
app_users     one doc per (appId, userId) — "users, scoped under an app"
              { createdAt, lastActiveAt, turnCount }

conversations one doc per (appId, userId, sessionId) — "conversations, scoped under a user"
              { messages: [...], createdAt, updatedAt }
```

The app owner can browse this in the **"End-User Chat History"** panel on the
app's management page — list of end-users on the left (most recently active
first), their conversation sessions on the right. Backed by the
owner-authenticated `GET /api/app-users` endpoint (never the SDK's
apiKey-based auth — an owner should never need their own app's SDK
credentials to see their own users' history).
