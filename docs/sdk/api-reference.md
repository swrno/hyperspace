# SDK API Reference

This document lists the TypeScript interfaces, classes, and error types exported by the **`hypr-sdk`** package.

---

## Configuration Interface

### `HyperClientConfig`
Pass this object to the constructors of `SimpleRetriver`, `HyperRetriever`, and `Ingestor`.

```ts
interface HyperClientConfig {
  /** Account-wide secret key (`sk_live_...`) generated under the API Keys tab. */
  apiKey: string;
  
  /** Unique App ID (`app_...`) of the application. */
  appId: string;
  
  /** Public client ID paired with the API Key (the owner's Firebase user ID). */
  clientId: string;
  
  /** Opaque identifier for your end-user. Scopes personalization memory partition. */
  userId: string;
  
  /** 
   * Toggles personalization memory recall/write independently of search mode.
   * If true, enables memory operations for the SimpleRetriver.
   * @default false 
   */
  personalisation?: boolean;
  
  /** 
   * Override the base API server URL. Useful for local development.
   * @default "https://api.hypr.ai"
   */
  baseUrl?: string;
}
```

::: danger Validation Checks
The constructor validates `apiKey`, `appId`, `clientId`, and `userId`. If any required string parameter is missing or empty, the client throws a validation error on initialization.
:::

---

## Retrievers & Methods

### `SimpleRetriver`
Executes low-latency vector search lookups.

* **Constructor**:
  ```ts
  const client = new HyperClient.simpleRetriver(config: HyperClientConfig);
  ```
* **Query Method**:
  ```ts
  query(message: string, options?: QueryOptions): Promise<string>
  ```
  - Sends a query payload to `/api/sdk/query` with `mode: "simple"`.
  - Returns the synthesized response string.
  - Personalization memory is bypassed unless `personalisation: true` is set in the constructor configuration.

---

### `HyperRetriever`
Executes deep, multi-hop planner-driven searches.

* **Constructor**:
  ```ts
  const client = new HyperClient.hyperRetriever(config: HyperClientConfig);
  ```
* **Query Method**:
  ```ts
  query(message: string, options?: QueryOptions): Promise<string>
  ```
  - Sends a query payload to `/api/sdk/query` with `mode: "hyper"`.
  - Runs multi-hop graph queries, fetches personalization memory, and writes conversation results to Cognee.
  - Returns the synthesized response string.

#### `QueryOptions`
```ts
interface QueryOptions {
  /** Links messages together under a single thread for dashboard history viewing. */
  sessionId?: string;
}
```

---

### `Ingestor`
Feeds raw documentation into a Knowledge Base.

* **Constructor**:
  ```ts
  const client = new HyperClient.ingestor(config: HyperClientConfig);
  ```
* **Ingestion Method**:
  ```ts
  ingest(kbId: string, text: string, options?: IngestOptions): Promise<IngestResult>
  ```
  - Sends raw text to `/api/sdk/ingest`.
  - **`kbId`**: Target Knowledge Base ID (must be linked to the active `appId`).
  - **`text`**: The raw string text to ingest.

#### `IngestOptions`
```ts
interface IngestOptions {
  /** User-defined name for the document (displayed in the dashboard). */
  docName?: string;
}
```

#### `IngestResult`
```ts
interface IngestResult {
  /** True if the document was successfully processed and written to Neo4j. */
  ok: boolean;
  /** Quantity of chunk nodes created in Neo4j. */
  chunks?: number;
  /** Quantity of entity nodes created and linked in Neo4j. */
  entities?: number;
}
```

---

## Error Handling

All SDK methods throw a `HyperApiError` if the backend returns a non-2xx HTTP status code.

### `HyperApiError`
```ts
export class HyperApiError extends Error {
  /** The HTTP response status code returned by the server (e.g., 401, 403, 429). */
  status: number;
  /** The raw error message returned by the server. */
  message: string;
}
```

### Try-Catch Example
```ts
import { HyperClient, HyperApiError } from 'hypr-sdk';

const retriever = new HyperClient.hyperRetriever(config);

try {
  const response = await retriever.query('Hello world');
} catch (error) {
  if (error instanceof HyperApiError) {
    console.error(`Request failed with status ${error.status}: ${error.message}`);
    
    if (error.status === 401) {
      // Handle invalid credentials or expired keys
    } else if (error.status === 429) {
      // Handle rate limits
    }
  } else {
    console.error('An unexpected connection error occurred:', error);
  }
}
```
