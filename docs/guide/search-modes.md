# Search modes

Three modes control both retrieval depth and which Fireworks models answer.
They're the same three modes across `/api/chat`, the app Playground, and
`/api/sdk/query` (there called `simple` for normal and `hyper` for deep).

| Mode | Retrieval | Model chain | Latency |
|---|---|---|---|
| **Normal** | Single-shot `vectorSearch` or `graphSearch` | `NORMAL_CHAIN`: `glm-5p2` → `gpt-oss-120b` | low |
| **Hyper** | `hybridSearch` — graph + vector, reranked (`qwen3-reranker-8b`) | `DEEP_CHAIN`: `kimi-k2p6` → `deepseek-v4-pro` | medium |
| **Deep** | `multiHopSearch` — a planner model decomposes the query into sub-questions, then `hybridSearch` per sub-question | `DEEP_CHAIN`, planner is `PLANNER_CHAIN`: `deepseek-v4-pro` → `kimi-k2p6` | highest |

All models are called through Fireworks' OpenAI-compatible endpoint with
multi-key rotation (`web/api/lib/llm.ts`) — one key's rate limit or outage
transparently fails over to the next.

## Reasoning models and leaked chain-of-thought

Fireworks reasoning models (all of the above) usually return chain-of-thought
in a separate `reasoning_content` field, which `generateReply()` strips out
into a `reasoning` field before the visible answer is built. Some models
occasionally inline `<think>...</think>` in `content` instead — that's also
stripped. A minority of prompts (self-referential or ambiguous ones) can
still cause a model to narrate its reasoning as plain, untagged prose with no
structural signal to strip; an explicit "Output Discipline" instruction is
appended to system prompts as a second line of defense, but this is
best-effort, not a hard guarantee.

## Only `/api/sdk/query`'s `hyper` mode reads personalization Memory

Retrieval depth (this page) and Memory (see [Memory](/guide/memory)) are
independent, but only the SDK's `hyper` mode combines both for a real
end-user. The owner-facing `/api/chat` always recalls memory regardless of
search mode, since there every request already has a stable, known user.
