# hypr-sdk

Client SDK for integrating third-party applications with hypr: retrieval over
an app's Knowledge Base, plus per-end-user personalization memory that builds
automatically from conversation.

## Install

```bash
npm install hypr-sdk
```

## Usage

```ts
import { HyperClient } from 'hypr-sdk';

const config = {
  apiKey: process.env.HYPER_API_KEY!,
  appId: process.env.HYPER_APP_ID!,
  userId: process.env.HYPER_USER_ID!,   // your own end-user's id
  clientId: process.env.HYPER_CLIENT_ID!,
};

// Fast, single-shot retrieval — no personalization memory.
const simpleRetriver = new HyperClient.simpleRetriver(config);
const answer = await simpleRetriver.query('What plans do we offer?');

// Deep retrieval + this end-user's own personalization memory.
const hyperRetriver = new HyperClient.hyperRetriever(config);
const personalized = await hyperRetriver.query('What did I ask about last time?');

// Ingest content into the app's linked Knowledge Base.
const ingestor = new HyperClient.ingestor(config);
await ingestor.ingest('kb_123', 'Some document text to add to the knowledge base.');
```

`apiKey` + `appId` + `clientId` identify and authorize your app; `userId` is
whatever id your own system uses for the person on the other end of the
conversation — hypr never sees more than that opaque string. Every user's
retrieval and memory are isolated from every other user of the same app.

### `simpleRetriver` vs `hyperRetriever`

| | `simpleRetriver` | `hyperRetriever` |
|---|---|---|
| Knowledge Base search | single-shot vector lookup | multi-hop planner + rerank |
| Personalization memory | no | yes, scoped to `userId` |
| Latency | low | higher |
| Use for | FAQ-style lookups | contextual, ongoing conversations |

### Config

| Field | Description |
|---|---|
| `apiKey` | App secret, generated when the app was created. |
| `appId` | Which app to talk to. |
| `clientId` | Public client id paired with `apiKey`. |
| `userId` | Your end-user's id. Scopes retrieval + memory. |
| `baseUrl` | Override the API base URL (defaults to the production endpoint). |
