# Memory (Cognee)

Memory is per-end-user personalization: key facts extracted automatically
from a person's own conversation, recalled on later turns so replies feel
continuous rather than stateless. It is completely separate from the
[Knowledge Base](/guide/knowledge-base) — Memory never touches Neo4j, and
Knowledge Base retrieval never touches Memory.

Implementation: `web/api/lib/cogneeMemory.ts` calls a real, already-provisioned
Cognee Cloud tenant (`COGNEE_BASE_URL` / `COGNEE_API_KEY`) over plain HTTP —
the same shape as every other external model call in this codebase (see
`lib/llm.ts`). There is no SDK dependency and no local process for this.

## Isolation

Each end-user gets their own Cognee **dataset**, named `hypr_user_<userId>`.
Cognee partitions storage per dataset, so a recall scoped to one user's
dataset can never surface another user's data — this is stronger than a
manual `WHERE userId = ...` filter, since there is no shared index to filter.

```ts
// api/lib/cogneeMemory.ts
rememberUserFact(userId, text)       // POST /api/v1/remember, dataset = hypr_user_<userId>
recallUserContext(userId, query)     // POST /api/v1/search,   dataset = hypr_user_<userId>
```

Both are best-effort: a failed or slow Cognee call never blocks or breaks a
chat reply (recall is wrapped in a short timeout; remember is fire-and-forget).

## Where it's wired in

| Surface | Recalls memory? | Writes memory? |
|---|---|---|
| `/api/chat` (owner's account chat) | yes, always | yes, when the message looks like a personal statement (`maybeRememberPSI`) |
| `/api/app-chat` (Playground) | yes, always | yes, after every turn |
| `/api/sdk/query`, mode `simple` | no | no |
| `/api/sdk/query`, mode `hyper` | yes | yes, after every turn |

## Prompt injection caveat

Cognee phrases recalled facts in whatever grammatical person the original
conversation used (often 2nd person: *"Your favorite color is teal."*). When
that text is pasted into a **third-party** app's system prompt under a label
like "what you remember about this user," the pronoun "you" becomes
ambiguous — does it mean the assistant or the end-user? This caused visible
model confusion in testing (the model would narrate its own uncertainty
instead of answering).

Fix: the injection is always framed explicitly —

> "These are facts about the USER (not about you, the assistant), recalled
> from their past conversations — quoted verbatim, phrasing may be first- or
> second-person from the original context."

If you add a new place that injects `recallUserContext()`'s result into a
prompt, keep this framing (see `app-chat.ts` / `sdk.ts` for the exact string).
For `/api/chat`, no such framing is needed — that surface addresses the same
person the memory is about, so "you" is unambiguous there.

## What's stored where

Memory facts live only in Cognee Cloud, keyed by dataset name — hypr's own
MongoDB never stores raw memory text. What MongoDB *does* store, per
end-user, is the raw conversation log (`conversations` collection) and a
lightweight activity record (`app_users` collection) — see
[Applications](/guide/applications#end-user-data).
