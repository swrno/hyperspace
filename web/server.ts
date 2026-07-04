import dotenv from 'dotenv';
dotenv.config(); // Base secrets from .env
dotenv.config({ path: '.env.local', override: true }); // Local overrides (gitignored)
import express from 'express';
import cors from 'cors';
import chatHandler from './api/chat.js';
import chatsHandler from './api/chats.js';
import adminUsersHandler from './api/admin/users.js';
import connectorsHandler from './api/connectors.js';
import kbHandler from './api/kb.js';
import syncHandler from './api/sync.js';
import statsHandler from './api/stats.js';
import graphHandler from './api/graph.js';
import { authorizeHandler, callbackHandler } from './api/oauth.js';
import { syncAllDue } from './api/ingest.js';
import { ensureUserIndexes } from './api/auth.js';
import { ensureSchema } from './api/lib/neo4j.js';
import appsHandler from './api/apps.js';
import appChatHandler from './api/app-chat.js';
import generatePromptHandler from './api/generate-prompt.js';
import { sdkQueryHandler, sdkIngestHandler } from './api/sdk.js';
import appUsersHandler from './api/app-users.js';

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 30);

if (!process.env.FIREWORKS_API_KEY && !process.env.FIREWORKS_API_KEYS) {
  console.warn('⚠️ WARNING: FIREWORKS_API_KEY is not set in .env file.');
  console.warn('The chatbot will not function correctly without it.');
}

app.use(cors());
// Raised from the 100kb default so base64-encoded PDF uploads fit in the body.
app.use(express.json({ limit: '25mb' }));

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
  await chatHandler(req, res);
});

// Chats Storage Endpoint
app.all('/api/chats', async (req, res) => {
  await chatsHandler(req, res);
});

// Admin Users Management Endpoint
app.all('/api/admin/users', async (req, res) => {
  await adminUsersHandler(req, res);
});

// Applications Endpoint
app.all('/api/apps', async (req, res) => {
  await appsHandler(req, res);
});

// App Playground Chat Endpoint
app.post('/api/app-chat', async (req, res) => {
  await appChatHandler(req, res);
});

// Generate Prompt Endpoint
app.post('/api/generate-prompt', async (req, res) => {
  await generatePromptHandler(req, res);
});

// hypr-sdk public surface — apiKey/appId/clientId auth, not Firebase (lib/sdkAuth.ts)
app.post('/api/sdk/query', async (req, res) => {
  await sdkQueryHandler(req, res);
});
app.post('/api/sdk/ingest', async (req, res) => {
  await sdkIngestHandler(req, res);
});

// Owner-facing: end-users of an app + their conversation history
app.get('/api/app-users', async (req, res) => {
  await appUsersHandler(req, res);
});

// Knowledge Source Connectors Endpoint
app.all('/api/connectors', async (req, res) => {
  await connectorsHandler(req, res);
});

// Knowledge Bases Endpoint
app.all('/api/kb', async (req, res) => {
  await kbHandler(req, res);
});

// ── Connector OAuth handshake (GitHub / Jira) ──────────────────────────────
app.get('/api/auth/:provider/authorize', async (req, res) => {
  await authorizeHandler(req, res);
});
app.get('/api/auth/:provider/callback', async (req, res) => {
  await callbackHandler(req, res);
});

// Ingestion sync — status + manual trigger
app.all('/api/sync', async (req, res) => {
  await syncHandler(req, res);
});

// Dashboard stats — real knowledge-graph aggregates
app.all('/api/stats', async (req, res) => {
  await statsHandler(req, res);
});

// Knowledge graph — nodes + edges for the graph viewer
app.all('/api/graph', async (req, res) => {
  await graphHandler(req, res);
});

// On Vercel the whole Express app is exported as ONE serverless function (see
// vercel.json → builds/routes), so we must NOT bind a port or start the long-
// running poll loop there. Locally / on any normal Node host we do both.
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Ensure the unique index on users.uid so first-login upserts stay idempotent.
    ensureUserIndexes().catch((e) => console.warn('ensureUserIndexes error:', e.message));

    // Build Neo4j vector/full-text indexes now that dotenv has loaded NEO4J_*.
    // (cognee.ts also lazily ensures this, but warming it here avoids the first
    // chat/ingest paying for index creation.)
    ensureSchema().catch((e) => console.warn('Neo4j ensureSchema error:', e.message));

    // Polling safety net / "update every N minutes" delta loop (architecture §7).
    // Runs continuously while the server is up; each tick polls connections whose
    // last sync is older than the interval and ingests only the changed items.
    setInterval(() => {
      syncAllDue(SYNC_INTERVAL_MINUTES).catch((e) =>
        console.warn('Periodic sync error:', e.message)
      );
    }, SYNC_INTERVAL_MINUTES * 60 * 1000);
  });

  // Graceful shutdown to prevent EADDRINUSE on hot-reloads
  const cleanup = () => server.close(() => process.exit(0));
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.once('SIGUSR2', () => server.close(() => process.kill(process.pid, 'SIGUSR2')));
}

// Vercel's @vercel/node runtime invokes this default export as (req, res).
export default app;
