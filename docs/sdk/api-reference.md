# hypr-sdk: API reference

## `HyperClientConfig`

```ts
interface HyperClientConfig {
  apiKey: string;    // App secret (sk_live_...), from the app's API Credentials
  appId: string;     // Which app to talk to (app_...)
  clientId: string;  // Public client id paired with apiKey (client_...)
  userId: string;    // Your own end-user's id — scopes retrieval + memory
  baseUrl?: string;  // Override the API base URL (defaults to production)
}
```

Every field except `baseUrl` is required — the constructor throws if any are missing.

## `HyperClient.simpleRetriver`

```ts
new HyperClient.simpleRetriver(config: HyperClientConfig)
```

### `.query(message, opts?)`

```ts
query(message: string, opts?: { sessionId?: string }): Promise<string>
```

Calls `POST /api/sdk/query` with `mode: "simple"`. Returns the answer text.
No personalization memory is used or updated.

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
