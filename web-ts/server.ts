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

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 30);

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is not set in .env file.');
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Polling safety net / "update every N minutes" delta loop (architecture §7).
  // Runs continuously while the server is up; each tick polls connections whose
  // last sync is older than the interval and ingests only the changed items.
  setInterval(() => {
    syncAllDue(SYNC_INTERVAL_MINUTES).catch((e) =>
      console.warn('Periodic sync error:', e.message)
    );
  }, SYNC_INTERVAL_MINUTES * 60 * 1000);
});
