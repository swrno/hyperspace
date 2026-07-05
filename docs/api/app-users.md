# Application End-Users API (`GET /api/app-users`)

This endpoint provides workspace owners with administrative visibility into the end-users connecting to their Applications. It powers the **"End-User Chat History"** log browser panel in the dashboard.

---

## Authentication & Headers

* **Authentication**: Requires a valid Firebase ID Token passed as a Bearer token in the `Authorization` header.
* **Headers**:
  ```http
  Authorization: Bearer <Firebase_ID_Token>
  ```

---

## Request Queries & Parameters

### 1. List Application Users
Fetch a paginated list of all unique end-users who have interacted with this specific application, sorted by last activity date (newest first).
```http
GET /api/app-users?appId=app_6c7d8e9f0a
```

### 2. Fetch User Sessions & Messages
Fetch the complete conversation log history, grouped by active session IDs, for a specific end-user.
```http
GET /api/app-users?appId=app_6c7d8e9f0a&userId=external_user_12345
```

---

## Response Payloads

### Response format (Listing Users)
Returned when `userId` query parameter is omitted:

```json
{
  "users": [
    {
      "userId": "external_user_12345",
      "createdAt": "2026-07-01T12:00:00.000Z",
      "lastActiveAt": "2026-07-05T16:00:00.000Z",
      "turnCount": 48
    },
    {
      "userId": "external_user_99887",
      "createdAt": "2026-07-03T09:30:00.000Z",
      "lastActiveAt": "2026-07-04T10:15:00.000Z",
      "turnCount": 6
    }
  ]
}
```

### Response format (Fetching User Sessions)
Returned when both `appId` and `userId` query parameters are provided:

```json
{
  "conversations": [
    {
      "sessionId": "session_development_discussion",
      "messages": [
        {
          "id": 1719876543210,
          "role": "user",
          "content": "Where is the build log located?",
          "timestamp": "2026-07-05T16:00:00.000Z"
        },
        {
          "id": 1719876543212,
          "role": "assistant",
          "content": "Build logs are exported directly into the `dist/` directory.",
          "timestamp": "2026-07-05T16:00:02.000Z"
        }
      ],
      "createdAt": "2026-07-05T16:00:00.000Z",
      "updatedAt": "2026-07-05T16:00:02.000Z"
    }
  ]
}
```

---

## Error States

| HTTP Status | Error Type | Cause / Resolution |
| :---: | :--- | :--- |
| **400** | Bad Request | Missing the required `appId` query parameter. |
| **401** | Unauthorized | Bearer token validation failed or expired. |
| **404** | Not Found | The specified `appId` does not exist or does not belong to the authenticated owner. |
| **500** | Server Error | Database failure while performing the search aggregations. |
