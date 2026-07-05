# hypr-sdk: API reference

## `HyperClientConfig`

```ts
interface HyperClientConfig {
  apiKey: string;           // Account secret (sk_live_...), created under your user's API Keys
  appId: string;            // Which app to talk to (app_...)
  clientId: string;         // Public client id paired with apiKey (the app owner's uid)
  userId: string;           // Your own end-user's id — scopes retrieval + memory
  personalisation?: boolean; // Recall + update memory even with simpleRetriver (default false)
  baseUrl?: string;         // Override the API base URL (defaults to production)
}
```

Every field except `personalisation` and `baseUrl` is required — the
constructor throws if any are missing.

## `HyperClient.simpleRetriver`

```ts
new HyperClient.simpleRetriver(config: HyperClientConfig)
```

### `.query(message, opts?)`

```ts
query(message: string, opts?: { sessionId?: string }): Promise<string>
```

Calls `POST /api/sdk/query` with `mode: "simple"`. Returns the answer text.
Single-shot Knowledge Base lookup only, no multi-hop planning. Personalization
memory is off by default — set `personalisation: true` in the config to
recall + update it without paying for `hyperRetriever`'s multi-hop search.

## `HyperClient.hyperRetriever`

```ts
new HyperClient.hyperRetriever(config: HyperClientConfig)
```

### `.query(message, opts?)`

```ts
query(message: string, opts?: { sessionId?: string }): Promise<string>
```

Calls `POST /api/sdk/query` with `mode: "hyper"`. Runs multi-hop Knowledge
Base retrieval, recalls this `userId`'s personalization memory, and — after
answering — extracts and stores any new facts from the turn.

`sessionId` groups turns into one conversation thread for the "End-User Chat
History" panel; omit it for an unrelated one-off query.

## `HyperClient.ingestor`

```ts
new HyperClient.ingestor(config: HyperClientConfig)
```

### `.ingest(kbId, text, opts?)`

```ts
ingest(kbId: string, text: string, opts?: { docName?: string }): Promise<{
  ok: boolean;
  chunks?: number;
  entities?: number;
}>
```

Calls `POST /api/sdk/ingest`. `kbId` must be one of the app's linked
Knowledge Base ids.

## Errors

Every method throws `HyperApiError` on a non-2xx response:

```ts
class HyperApiError extends Error {
  status: number;
  message: string;
}
```

```ts
import { HyperApiError } from 'hypr-sdk';

try {
  await hyperRetriver.query('...');
} catch (e) {
  if (e instanceof HyperApiError && e.status === 401) {
    // bad apiKey / appId / clientId
  }
}
```
