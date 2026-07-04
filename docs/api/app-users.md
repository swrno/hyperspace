# GET /api/app-users

Owner-facing view of an app's end-users and their conversations — powers the
"End-User Chat History" panel. Firebase-authenticated (the app owner),
**not** the SDK's apiKey/appId/clientId auth — an owner should never need
their own app's SDK credentials to see their own users' history.

**Auth**: `Authorization: Bearer <Firebase ID token>`

## Request

```
GET /api/app-users?appId=<appId>                    → list this app's end-users
GET /api/app-users?appId=<appId>&userId=<userId>     → that user's conversation sessions
```

## Response

Without `userId`:

```jsonc
{
  "users": [
    { "userId": "string", "createdAt": "string", "lastActiveAt": "string", "turnCount": "number" }
  ]
}
```

With `userId`:

```jsonc
{
  "conversations": [
    {
      "sessionId": "string",
      "messages": [{ "id": "number", "role": "user" | "assistant", "content": "string", "timestamp": "string" }],
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

Returns `404` if `appId` doesn't belong to the authenticated owner.
