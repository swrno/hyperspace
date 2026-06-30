import type { Request, Response } from 'express';
import { verifyToken } from './auth.js';
import { listConnections } from './connections.js';
import { runInitialSync, runDeltaSync, syncUser } from './ingest.js';

/**
 * Sync status + manual trigger.
 *
 *   GET  /api/sync                       → status of all the user's connections
 *   POST /api/sync { provider, full? }   → trigger a sync now
 *        full=true  → re-run the initial snapshot
 *        otherwise  → run a delta poll
 */
export default async function handler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    const user = await verifyToken(req);

    if (req.method === 'GET') {
      const conns = await listConnections(user.uid);
      const status = conns.map((c) => ({
        provider: c.provider,
        status: c.status,
        account: c.providerUsername,
        site: c.siteName || undefined,
        initialSyncStatus: c.initialSyncStatus,
        entityCount: c.entityCount || 0,
        lastSyncAt: c.lastSyncAt || null,
        error: c.error || null,
      }));
      return res.status(200).json({ connections: status });
    }

    if (req.method === 'POST') {
      const { provider, full, selectedItems = [] } = req.body || {};

      // No provider → refresh every connected source ("Sync now").
      const run = !provider
        ? syncUser(user.uid)
        : full
          ? runInitialSync(user.uid, provider, selectedItems)
          : runDeltaSync(user.uid, provider);

      // Snapshots can be long; don't hold the request open.
      run.catch((e) => console.warn(`Manual sync failed:`, e.message));
      return res.status(202).json({ accepted: true, provider: provider || 'all', mode: provider && full ? 'initial' : 'delta' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/sync:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Sync failed' });
  }
}
