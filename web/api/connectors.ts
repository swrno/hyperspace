import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { ingest as cogneeIngest, formatConnectorPayload } from './cognee.js';
import { getConnection, getAccessToken } from './connections.js';
import { runInitialSync } from './ingest.js';
import * as google from './lib/google.js';

// Connectors that authorize through one shared Google OAuth grant.
const GOOGLE_CONNECTORS = ['gdocs', 'gslides', 'gsheets', 'gcal'];

/**
 * Connector / knowledge-source endpoint.
 *
 * Stores, per user, which enterprise sources are authorized and exactly which
 * items (repos, docs, channels…) have been selected for ingestion into the
 * Cognee knowledge graph.
 *
 * Routes (all on /api/connectors):
 *   GET                          → { connectors: { [platform]: {...} } }
 *   POST { action: 'list-items' }→ { items, live }  (available items to pick)
 *   POST { action: 'save', ... } → persist a connected source + selection
 *   DELETE ?platform=github      → disconnect a source
 *
 * Item shape is identical to what the real provider APIs return, so wiring in
 * live OAuth later requires no frontend changes - only the fetch* helpers below.
 */

// Representative items used until a live provider token is configured.
const SAMPLE_ITEMS = {
  github: [
    { id: 'gh-1', name: 'acme/frontend-app', meta: 'TypeScript · updated 2h ago' },
    { id: 'gh-2', name: 'acme/payments-service', meta: 'Go · updated 1d ago' },
    { id: 'gh-3', name: 'acme/infra-terraform', meta: 'HCL · updated 3d ago' },
    { id: 'gh-4', name: 'acme/design-system', meta: 'CSS · updated 5d ago' },
    { id: 'gh-5', name: 'acme/data-pipeline', meta: 'Python · updated 1w ago' },
    { id: 'gh-6', name: 'acme/mobile-app', meta: 'Swift · updated 2w ago' },
  ],
  gdocs: [
    { id: 'gd-1', name: 'Q3 Product Requirements', meta: 'Doc · shared with you' },
    { id: 'gd-2', name: 'Engineering Onboarding', meta: 'Doc · owned by you' },
    { id: 'gd-3', name: 'API Style Guide', meta: 'Doc · owned by you' },
    { id: 'gd-4', name: 'Incident Postmortems', meta: 'Doc · shared with you' },
    { id: 'gd-5', name: 'Security Review Notes', meta: 'Doc · shared with you' },
  ],
  gslides: [
    { id: 'gs-1', name: 'Company All-Hands Q3', meta: 'Slides · shared' },
    { id: 'gs-2', name: 'Architecture Review', meta: 'Slides · owned' },
    { id: 'gs-3', name: 'Sales Enablement Deck', meta: 'Slides · shared' },
  ],
  gsheets: [
    { id: 'gsh-1', name: 'Q3 Revenue Model', meta: 'Sheet · owned by you' },
    { id: 'gsh-2', name: 'Hiring Tracker', meta: 'Sheet · shared with you' },
    { id: 'gsh-3', name: 'Infra Cost Breakdown', meta: 'Sheet · owned by you' },
  ],
  gcal: [
    { id: 'gc-1', name: 'Sprint Planning', meta: 'Mon 10:00 AM' },
    { id: 'gc-2', name: 'Architecture Review', meta: 'Tue 2:00 PM' },
    { id: 'gc-3', name: 'Customer QBR — Acme', meta: 'Thu 11:00 AM' },
  ],
  jira: [
    { id: 'ji-1', name: 'PLAT · Platform', meta: '128 issues · 12 open' },
    { id: 'ji-2', name: 'WEB · Web App', meta: '74 issues · 8 open' },
    { id: 'ji-3', name: 'INFRA · Infrastructure', meta: '39 issues · 3 open' },
    { id: 'ji-4', name: 'MOB · Mobile', meta: '52 issues · 5 open' },
  ],
  slack: [
    { id: 'sl-1', name: '#engineering', meta: '~1.2k messages / week' },
    { id: 'sl-2', name: '#incidents', meta: '~230 messages / week' },
    { id: 'sl-3', name: '#product', meta: '~540 messages / week' },
    { id: 'sl-4', name: '#general', meta: '~2.1k messages / week' },
  ],
  salesforce: [
    { id: 'sf-1', name: 'Acme Corp', meta: 'Enterprise · $1.2M ARR' },
    { id: 'sf-2', name: 'Globex', meta: 'Mid-Market · $340k ARR' },
    { id: 'sf-3', name: 'Initech', meta: 'Enterprise · $890k ARR' },
  ],
};

/** Live GitHub repo listing when a token is present (PAT or OAuth access token). */
async function fetchGitHubRepos(token) {
  const res = await fetch('https://api.github.com/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const repos = await (res.json() as any);
  return repos.map(r => ({
    id: `gh-${r.id}`,
    name: r.full_name,
    meta: `${r.language || 'Repo'} · ${r.private ? 'private' : 'public'}${r.pushed_at ? ` · updated ${timeAgo(r.pushed_at)}` : ''}`,
  }));
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

async function listItems(platform, userId) {
  // Prefer a real per-user OAuth connection; fall back to a shared PAT, then samples.
  if (platform === 'github') {
    let token = null;
    try {
      const conn = await getConnection(userId, 'github');
      if (conn) token = await getAccessToken(conn);
    } catch (e) {
      console.warn('GitHub connection token unavailable:', e.message);
    }
    token = token || process.env.GITHUB_TOKEN;
    if (token) {
      try {
        return { items: await fetchGitHubRepos(token), live: true };
      } catch (e) {
        console.warn('GitHub live fetch failed, using sample data:', e.message);
      }
    }
  }

  // All Google connectors share one OAuth connection (stored under 'google').
  if (GOOGLE_CONNECTORS.includes(platform)) {
    try {
      const conn = await getConnection(userId, 'google');
      if (conn) {
        const token = await getAccessToken(conn);
        let items;
        if (platform === 'gcal') items = await google.calendarList(token);
        else items = await google.listFiles(token, platform); // gdocs / gslides / gsheets
        return { items, live: true };
      }
    } catch (e) {
      console.warn('Google live fetch failed, using sample data:', e.message);
    }
  }

  return { items: SAMPLE_ITEMS[platform] || [], live: false };
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    const user = await verifyToken(req);
    const db = await getDb();
    const col = db.collection('connectors');

    if (req.method === 'GET') {
      const doc = await col.findOne({ userId: user.uid });
      return res.status(200).json({ connectors: doc?.connectors || {} });
    }

    if (req.method === 'POST') {
      const { action, platform } = req.body || {};
      if (!platform) return res.status(400).json({ error: 'platform is required' });

      if (action === 'list-items') {
        const { items, live } = await listItems(platform, user.uid);
        return res.status(200).json({ items, live });
      }

      if (action === 'save') {
        const { account, selectedItems = [], status = 'synced', lastSync } = req.body;
        await col.updateOne(
          { userId: user.uid },
          {
            $set: {
              userId: user.uid,
              [`connectors.${platform}`]: {
                connected: true,
                account: account || user.email,
                selectedItems,
                status,
                lastSync: lastSync || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          },
          { upsert: true }
        );
        // If a real OAuth connection exists for this platform, run the full
        // ingestion pipeline (snapshot → normalise → Mongo + Cognee). Otherwise
        // fall back to the lightweight payload-text ingest for demo connectors.
        const oauthProvider = GOOGLE_CONNECTORS.includes(platform) ? 'google' : platform;
        let liveConn = null;
        try {
          liveConn = await getConnection(user.uid, oauthProvider);
        } catch { /* ignore */ }

        const ingestable = ['github', 'jira', ...GOOGLE_CONNECTORS];
        if (liveConn && ingestable.includes(platform)) {
          runInitialSync(user.uid, platform, selectedItems).catch(e =>
            console.warn(`Initial sync failed for ${platform} (non-fatal):`, e.message)
          );
        } else if (selectedItems.length > 0) {
          const payload = formatConnectorPayload(user.uid, user.email, platform, selectedItems);
          cogneeIngest(payload, { userId: user.uid, nodeSet: [platform] })
            .catch(e => console.warn('Cognee ingest failed (non-fatal):', e.message));
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    if (req.method === 'DELETE') {
      const platform = req.query?.platform;
      if (!platform) return res.status(400).json({ error: 'platform is required' });
      await col.updateOne({ userId: user.uid }, { $unset: { [`connectors.${platform}`]: '' } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/connectors:', error.message);
    return res.status(error.message.includes('Authorization') ? 418 : 500).json({
      error: error.message || 'Request failed',
    });
  }
}
