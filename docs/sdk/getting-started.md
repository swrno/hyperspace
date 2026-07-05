# hypr-sdk: Getting started

`hypr-sdk` (`packages/hypr-sdk`) is the client for integrating a hypr app's
Knowledge Base and personalization Memory into any third-party application.

## Install

```bash
npm install hypr-sdk
```

## Get your credentials

`appId` and `clientId` come from the app's management page in hypr, under
**API Credentials**. `apiKey` is different — it's not per-app, it's created
under your hypr account's **API Keys** section, and any of your keys
authenticates any app you own. `userId` is not from hypr at all, it's your
own system's id for the person you're talking to.

```ts
import { HyperClient } from 'hypr-sdk';

const config = {
  apiKey: process.env.HYPER_API_KEY!,
  appId: process.env.HYPER_APP_ID!,
  clientId: process.env.HYPER_CLIENT_ID!,
  userId: currentUser.id, // your own end-user's id — not a hypr credential
};
```

## Query the Knowledge Base

```ts
// Fast, single-shot retrieval — no personalization memory.
const simpleRetriver = new HyperClient.simpleRetriver(config);
const answer = await simpleRetriver.query('What plans do we offer?');

// Deep retrieval + this end-user's own personalization memory.
const hyperRetriver = new HyperClient.hyperRetriever(config);
const personalized = await hyperRetriver.query('What did I ask about last time?');
```

| | `simpleRetriver` | `hyperRetriever` |
|---|---|---|
| Knowledge Base search | single-shot vector lookup | multi-hop planner + rerank |
| Personalization memory | opt-in (see below) | always on, scoped to `userId` |
| Latency | low | higher |
| Use for | FAQ-style lookups | contextual, ongoing conversations |

Personalization memory builds automatically — every query that personalizes
both recalls and updates that end-user's memory. There's no separate
"remember this" call for conversational facts.

Memory is independent of which retriever you use. `hyperRetriever` always
personalizes; `simpleRetriver` only does if you set `personalisation: true`
in the config — useful when you want fast single-shot KB search *and*
memory, without paying for multi-hop planning:

```ts
const simpleRetriver = new HyperClient.simpleRetriver({ ...config, personalisation: true });
const answer = await simpleRetriver.query('What plans do we offer?');
```

## Ingest content

For content that isn't part of a normal conversation turn — e.g. syncing your
own product docs into the app's Knowledge Base:

```ts
const ingestor = new HyperClient.ingestor(config);
await ingestor.ingest('kb_123', 'Some document text to add to the knowledge base.');
```

`kb_123` must be one of the app's linked Knowledge Base ids — ingestion
targets the app's shared documents, not any one user's personal memory.

## Isolation

`apiKey` + `appId` + `clientId` together identify and authorize *your app*
(`apiKey` proves it's you, `appId`/`clientId` say which app). `userId` scopes
retrieval and memory to *one end-user of that app* — hypr partitions storage
per user, so one user's data can never leak into another's response, even
within the same app.

Next: [API reference](/sdk/api-reference) for the full config and return types.
