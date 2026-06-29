# hypr — Web (TypeScript)

Full TypeScript migration of `web/`: the **React UI + the Express/Mongo/Cognee
backend** (auth, connectors, ingestion pipeline, and retrieval layer). One repo,
one toolchain.

- **Frontend** — Vite + React + Tailwind SPA (`src/`)
- **Backend** — Express API run with `tsx` (`server.ts`, `api/**`)

## What's TypeScript now

Frontend (strict):

- React UI: `App.tsx`, `Dashboard.tsx`, `GraphView.tsx`, `KnowledgeBases.tsx`,
  `NotFound.tsx`, `main.tsx`
- Auth: `firebase.ts` · utils: `greetings.ts`
- Typed env (`src/vite-env.d.ts`), domain types (`src/types.ts`)
- Tooling: `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`

Backend (`tsconfig.server.json`):

- Entry: `server.ts`
- Auth + rate limiting: `api/auth.ts`
- Connectors + OAuth handshake: `api/connectors.ts`, `api/oauth.ts`, `api/connections.ts`
- Ingestion pipeline: `api/ingest.ts`, `api/sync.ts`, `api/lib/{github,google,jira,schema,graphbuild,pdf,crypto}.ts`
- Retrieval layer: `api/retrieval.ts`, `api/cognee.ts`, `api/lib/router.ts`
- Chat + data: `api/chat.ts`, `api/chats.ts`, `api/kb.ts`, `api/stats.ts`, `api/graph.ts`, `api/admin/users.ts`, `api/mongodb.ts`
- Shared backend domain types: `api/types.ts`

### Typing posture

The frontend is `strict: true`. The backend (`tsconfig.server.json`) is a
**pragmatic** migration: route handlers use Express `Request`/`Response`, and
canonical document shapes are documented in `api/types.ts`, but `strict` /
`strictNullChecks` / `noImplicitAny` are relaxed and the Mongo handle is loosely
typed — the API layer is dominated by dynamic Mongo documents and third-party
payloads, so this avoids hundreds of guards/casts while still compiling and
running. Both projects type-check with zero errors.

> The original `.js` import specifiers (e.g. `from './mongodb.js'`) are kept —
> under `moduleResolution: NodeNext` they resolve to the `.ts` sources.

## Running

```bash
npm install
cp .env.example .env.local   # fill in Firebase + backend secrets

# Run both (Express API on :3000, Vite on :5173, /api proxied):
npm run dev:full

# …or separately, in two terminals:
npm run server   # tsx watch server.ts   (backend, :3000)
npm run dev      # vite                   (frontend, :5173)
```

Scripts:

- `npm run dev` — Vite dev server (proxies `/api` → `:3000`)
- `npm run server` — Express API via `tsx watch`
- `npm run start` — Express API (no watch)
- `npm run dev:full` — both at once (concurrently)
- `npm run build` — frontend type-check + production build
- `npm run typecheck` — type-check frontend **and** backend
- `npm run preview` — preview the production build

The backend runs without a database (in-memory fallback) and without LLM/Cognee
keys (degraded), so it boots for local UI work even with a mostly-empty
`.env.local`.
