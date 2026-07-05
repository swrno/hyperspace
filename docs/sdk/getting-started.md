# SDK Getting Started

The **`hypr-sdk`** (`packages/hypr-sdk`) is the client library used to integrate the `hypr` Knowledge Base search engine and Personal Memory profiles into external third-party applications.

---

## Installation

Install the package via your preferred package manager:

```bash
npm install hypr-sdk
# or
yarn add hypr-sdk
# or
pnpm add hypr-sdk
```

---

## Configuration & Credentials

To construct a client, you need four key parameters.

```ts
import { HyperClient } from 'hypr-sdk';

const config = {
  apiKey: process.env.HYPER_API_KEY!,     // Your private secret key (sk_live_...)
  appId: process.env.HYPER_APP_ID!,       // The target App identifier (app_...)
  clientId: process.env.HYPER_CLIENT_ID!, // Your dashboard account user ID
  userId: currentUser.id,                 // Opaque identifier mapping to your active end-user
};
```

::: warning Spelling Tip
Due to exports in the core client packages, the classes and properties are named:
- **Class**: `SimpleRetriver` *(Notice the missing 'e' in Retriver)*
- **Client Namespace**: `HyperClient.simpleRetriver`
- **Class**: `HyperRetriever` *(Standard spelling)*
- **Client Namespace**: `HyperClient.hyperRetriever`
:::

---

## Initializing and Querying

### 1. Fast Vector Retrieval (`simpleRetriver`)
Best for FAQ-style lookups, stateless search queries, or high-throughput queries where latency must be kept under 2s.

```ts
import { HyperClient } from 'hypr-sdk';

// Initialize simple retriever (Personal Memory is disabled by default)
const simpleClient = new HyperClient.simpleRetriver(config);

const answer = await simpleClient.query('What is our corporate policy on remote work?');
console.log(answer);
```

---

### 2. Fast Vector Retrieval + Personal Memory
You can enable Personalization Memory inside the simple retriever to combine low-latency vector search with context recall.

```ts
const simplePersonalisedClient = new HyperClient.simpleRetriver({
  ...config,
  personalisation: true
});

const answer = await simplePersonalisedClient.query('Tell me about policy options matching my home location.');
```

---

### 3. Deep Planning Retrieval + Personal Memory (`hyperRetriever`)
Best for deep, analytical conversations. This retriever uses a multi-hop planner to decompose the query, matches chunks, executes full-text searches, reranks findings, and incorporates personal context.

```ts
// Initialize hyper retriever (Personal Memory is always enabled)
const hyperClient = new HyperClient.hyperRetriever(config);

const reply = await hyperClient.query('Based on what I worked on last week, what tasks are pending?');
console.log(reply);
```

---

## Quick Comparison

| Metric / Parameter | `simpleRetriver` | `hyperRetriever` |
| :--- | :---: | :---: |
| **Knowledge Base Search** | Single-shot vector similarity | Multi-hop query planner + Rerank |
| **Personalization Memory** | Disabled by default (Opt-in) | Enabled by default |
| **Target Latency** | **Low** (<2s) | **Medium-High** (3s - 10s) |
| **Ideal Use Case** | Direct Q&A, facts, search tools | Reasoning, chat assistants, analysis |

---

## Document Ingestion

To programmatically feed new documents, drafts, or databases into a Knowledge Base (linked to your App):

```ts
import { HyperClient } from 'hypr-sdk';

const ingestor = new HyperClient.ingestor(config);

const result = await ingestor.ingest(
  'kb_development_6c7d8e', 
  'This is document content detailing the authentication guidelines...',
  { docName: 'auth_docs_draft.md' }
);

if (result.ok) {
  console.log(`Ingested ${result.chunks} chunks and ${result.entities} entities.`);
}
```

::: important Scoping Ingests
Ingestion targets a **Knowledge Base** (`kbId`) linked to the application. Ingested items become readable by *all* end-users querying the application. End-user personalization memory is updated automatically during chat loops and is never modified using the `ingestor` class.
:::
