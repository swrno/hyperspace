# POST /api/chat

The owner's own account-wide chat. Grounds answers in every Knowledge Base
the account owns (or one specific KB via `kbId`), at the retrieval depth
chosen by `mode`. Always recalls and updates this owner's Memory.

**Auth**: `Authorization: Bearer <Firebase ID token>`

## Request

```jsonc
{
  "message": "string, required",
  "history": [{ "role": "user" | "assistant", "content": "string" }],
  "mode": "normal" | "deep" | "hyper",  // default "normal" — see Search modes
  "kbId": "string, optional"             // scope to one knowledge base
}
```

## Response

```jsonc
{
  "response": "string",
  "reasoning": "string | undefined",  // chain-of-thought, if the model returned any
  "title": "string | undefined",       // auto-generated for brand-new conversations
  "retrievalMode": "normal" | "deep" | "hyper"
}
```

## Errors

| Status | Meaning |
|---|---|
| 418 | Authorization failed (see `verifyToken()` — yes, really 418) |
| 429 | Hourly rate limit reached for this account |
| 500 | All Fireworks models in the chain failed, or another internal error |

See [Search modes](/guide/search-modes) for what `mode` changes about
retrieval and model selection.
