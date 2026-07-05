# Search & Retrieval Modes

`hypr` offers three retrieval tiers controlling vector/graph search depth, context composition, and LLM processing chains.

---

## Retrieval Tiers & Model Chains

| Mode | Database Retrieval Pipeline | LLM Routing Chain | Target Latency |
| :--- | :--- | :--- | :--- |
| **Normal** (Default) | Single-shot `hybridSearch` (vector + graph) with 8 candidates. | `NORMAL_CHAIN`:<br>1. `glm-5p2` (Fast Reasoning)<br>2. `gpt-oss-120b` (Fallback) | ~1.2s - 2s |
| **Hyper** | Reranked `hybridSearch` (vector + graph, 10 candidates) processed through `qwen3-reranker-8b`. | `DEEP_CHAIN`:<br>1. `kimi-k2p6` (Deep Reasoning)<br>2. `deepseek-v4-pro` (Fallback) | ~3s - 5s |
| **Deep** | `multiHopSearch` where `PLANNER_CHAIN` decomposes query into sub-questions, runs hybrid + rerank per sub-question, then deduplicates. | `DEEP_CHAIN` using `PLANNER_CHAIN`:<br>1. `deepseek-v4-pro`<br>2. `kimi-k2p6` | ~8s - 15s |

---

## High-Availability Multi-Key Rotation

Rate limits (HTTP 429) or transient provider capacities (HTTP 503) can block real-time applications. To prevent downtime, `hypr` uses a round-robin key rotation and retry mechanism:

1. **Key Setup**: Owners configure a comma-separated list of api keys via `FIREWORKS_API_KEYS`.
2. **Round-Robin Execution**: The system rotates through keys using an internal index cursor (`_fwCursor`), spreading traffic evenly across credentials.
3. **Transparent Retries**: If a request encounters a key error (status code `401`, `402`, `403`, `429`, or `503`), it automatically retries with the next key in the rotation sequence before throwing an error.

---

## Chain-of-Thought Splitting

Reasoning models (like `deepseek-v4-pro` or `kimi-k2p6`) output their step-by-step thinking processes. This content should not leak into the end-user's visible response. `hypr` handles this by separating the thinking process from the final answer:

* **Separate Fields**: When the model returns a distinct `reasoning_content` parameter, we capture it and move it to a dedicated `reasoning` payload property.
* **Inline Tag Parsing**: Some models return inline thinking blocks wrapped in tags like `<think>...</think>`, `<thinking>...</thinking>`, or `<reasoning>...</reasoning>`. The server uses regular expressions to extract these blocks, clean the markup, and append the raw thoughts to the `reasoning` response field.
* **Truncated Output Safeguards**: If a response is truncated mid-thought, any unclosed opening tag is caught. The system treats everything after the tag as reasoning content to prevent broken markup from displaying in the UI.

---

## Personalization Memory Integration

Retrieval depth and Personal Memory are managed independently, but they work together depending on the endpoint:

* **`/api/chat` (Owner Dashboard)**: Recalls Memory on every turn regardless of search mode.
* **`/api/sdk/query`**:
  - `simple` mode: Memory is bypassed unless the developer passes `personalisation: true`.
  - `hyper` mode: Personal Memory writes and retrievals are enabled automatically.
