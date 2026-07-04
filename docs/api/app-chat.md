# POST /api/app-chat

The Playground inside an [Application](/guide/applications) — the owner
testing their own app before shipping it. Retrieval is scoped to the app's
`linkedKbIds`; Memory personalization uses `endUserId` (falling back to
`sessionId`, since the owner's own playground has no separate end-user
identity).

**Auth**: `Authorization: Bearer <Firebase ID token>` (the app owner)

## Request

```jsonc
{
  "appId": "string, required",
  "message": "string, required",
  "systemPrompt": "string, optional — overrides the app's saved prompt",
  "model": "string, optional — a Fireworks model id, leads the fallback chain",
  "searchMode": "normal" | "hyper" | "deep",  // default "normal"
  "temperature": "number, optional",
  "maxTokens": "number, optional",
  "topP": "number, optional",
  "history": [{ "role": "user" | "assistant", "content": "string" }],
  "linkedKbIds": ["string"],
  "sessionId": "string, default \"default\"",
  "endUserId": "string, optional — defaults to sessionId"
}
```

## Response

```jsonc
{
  "userMessage": { "id": "number", "role": "user", "content": "string", "timestamp": "string", "sessionId": "string" },
  "aiMessage": { "id": "number", "role": "assistant", "content": "string", "reasoning": "string | undefined", "timestamp": "string", "sessionId": "string" }
}
```

Both messages are appended to the app's Mongo document (`apps.messages`) and,
separately, to that end-user's `conversations` record (see
[Applications: End-user data](/guide/applications#end-user-data)).
