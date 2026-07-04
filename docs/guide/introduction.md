# What is hypr?

hypr is an enterprise knowledge platform built around two deliberately separate
systems, plus a client SDK that brings both into any third-party app:

| System | Backing store | Purpose |
|---|---|---|
| **Knowledge Base** | Neo4j | Documents, entities, and relationships extracted from connected tools (GitHub, Jira, Google Docs/Slides/Calendar) or uploaded directly. Shared across an app's users. |
| **Memory** | [Cognee](https://www.cognee.ai) Cloud | Key facts extracted automatically from a single end-user's own conversation history. Private to that user; never shared with anyone else. |
| **hyper-sdk** | — | A TypeScript client (`packages/hyper-sdk`) that lets any external application query a hypr app's Knowledge Base and get memory-personalized answers for its own end-users. |

::: tip Don't confuse these two
Neo4j is the Knowledge Base. Cognee is Memory. A node in one never appears in
the other — see [Knowledge Base](/guide/knowledge-base) and
[Memory](/guide/memory) for what each actually stores.
:::

## The three chat surfaces

- **`/api/chat`** — the owner's own account-wide chat. Answers grounded in
  every knowledge base the account owns, with retrieval depth chosen by
  [search mode](/guide/search-modes).
- **`/api/app-chat`** — the "Playground" inside an [Application](/guide/applications):
  the owner testing their own app before shipping it.
- **`/api/sdk/query`** — what a real end-user talks to, via `hyper-sdk`,
  once an app is integrated into a third-party product. This is the only
  surface where per-end-user Memory personalization applies.

## Where to go next

- New to the codebase? Start with [Architecture](/guide/architecture).
- Integrating a third-party app? Start with [hyper-sdk: Getting started](/sdk/getting-started).
- Looking for a specific endpoint? See the [API reference](/api/chat).
