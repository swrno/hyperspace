import type { Request, Response } from 'express';
import { verifyToken } from './auth.js';
import { getDb } from './mongodb.js';
import { createOAuthState, consumeOAuthState, saveConnection } from './connections.js';
import { runInitialSync } from './ingest.js';
import * as github from './lib/github.js';
import * as jira from './lib/jira.js';
import * as google from './lib/google.js';

/**
 * OAuth handshake endpoints (stage 1 — Authorization).
 *
 *   GET /api/auth/:platform/authorize?token=<firebaseIdToken>
 *        → verifies the hypr user, mints a CSRF state bound to their uid +
 *          the originating UI platform, redirects to the provider consent screen.
 *
 *   GET /api/auth/:provider/callback?code=…&state=…
 *        → validates state, exchanges code, resolves identity, stores the
 *          encrypted connection, kicks off the snapshot, bounces to the SPA.
 *
 * A UI connector can map to a shared OAuth provider — Google Docs and Slides
 * both authorize through one `google` grant.
 */

const APP_BASE = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

type OAuthProvider = 'github' | 'jira' | 'google';

// UI connector id → OAuth provider that actually handles it.
const UI_TO_OAUTH: Record<string, OAuthProvider | undefined> = {
  github: 'github',
  jira: 'jira',
  gdocs: 'google',
  gslides: 'google',
  gsheets: 'google',
  gcal: 'google',
};

// One OAuth config per real provider.
const OAUTH: Record<string, { authorizeUrl: (redirectUri: string, state: string) => string; exchange: (code: string, redirectUri: string) => Promise<unknown> } | undefined> = {
  github: { authorizeUrl: github.authorizeUrl, exchange: github.exchangeCode },
  jira: { authorizeUrl: jira.authorizeUrl, exchange: jira.exchangeCode },
  google: { authorizeUrl: google.authorizeUrl, exchange: google.exchangeCode },
};

function redirectUri(oauthProvider: string) {
  return `${APP_BASE}/api/auth/${oauthProvider}/callback`;
}

/** GET /api/auth/:platform/authorize */
export async function authorizeHandler(req: Request, res: Response) {
  const uiPlatform = req.params.provider;
  const op = UI_TO_OAUTH[uiPlatform];
  if (!op) return res.status(404).json({ error: 'Unknown provider' });

  // The browser hits this directly (a redirect, not fetch), so the Firebase
  // token rides as a query param rather than an Authorization header.
  const token = req.query.token;
  try {
    const user = await verifyToken({ headers: { authorization: `Bearer ${token}` } });
    // Store the originating UI platform so the callback can return the user to
    // the right connector card (gdocs vs gslides).
    const state = await createOAuthState(user.uid, uiPlatform);
    const url = OAUTH[op]!.authorizeUrl(redirectUri(op), state);
    return res.redirect(url);
  } catch (e: any) {
    console.error('authorize error:', e.message);
    return res.redirect(`${APP_BASE}/?connect_error=${encodeURIComponent(uiPlatform)}`);
  }
}

/** Mark the originating UI connector card as connected — the SPA reads this
    from /api/connectors. Item selection now lives in the Knowledge tab, so the
    callback is what flips the card. Field-level $set keeps any previously
    selected items intact on reconnect. */
async function markConnected(userId: string, uiPlatform: string, account?: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection('connectors').updateOne(
    { userId },
    {
      $set: {
        userId,
        [`connectors.${uiPlatform}.connected`]: true,
        [`connectors.${uiPlatform}.account`]: account || 'connected',
        [`connectors.${uiPlatform}.status`]: 'connected',
        [`connectors.${uiPlatform}.lastSync`]: now,
        [`connectors.${uiPlatform}.updatedAt`]: now,
      },
    },
    { upsert: true },
  );
}

/** GET /api/auth/:provider/callback */
export async function callbackHandler(req: Request, res: Response) {
  const op = req.params.provider; // github | jira | google
  const { code, state, error } = req.query;
  const back = (status: string, platform?: string) =>
    res.redirect(`${APP_BASE}/?screen=integrations&${status}=${encodeURIComponent(platform || op)}`);

  if (error) return back('connect_denied');
  if (!OAUTH[op] || !code || !state) return back('connect_error');

  try {
    const ctx = await consumeOAuthState(state);
    if (!ctx) throw new Error('Invalid or expired state');
    const userId = ctx.userId;
    const uiPlatform = ctx.provider; // github | jira | gdocs | gslides
    const ruri = redirectUri(op);

    if (op === 'github') {
      const tokens = await github.exchangeCode(code, ruri);
      const gh = await github.getUser(tokens.accessToken);
      await saveConnection(userId, 'github', tokens, { accountId: String(gh.id), username: gh.login });
      await markConnected(userId, uiPlatform, gh.login);
    } else if (op === 'jira') {
      const tokens = await jira.exchangeCode(code, ruri);
      const sites = await jira.accessibleResources(tokens.accessToken);
      const site = sites[0];
      if (!site) throw new Error('No accessible Jira site');
      const acct = await jira.me(tokens.accessToken);
      await saveConnection(userId, 'jira', tokens, {
        accountId: acct?.account_id,
        username: acct?.email || acct?.name,
        cloudId: site.id,
        siteUrl: site.url,
        siteName: site.name,
      });
      await markConnected(userId, uiPlatform, acct?.email || acct?.name);
    } else if (op === 'google') {
      const tokens = await google.exchangeCode(code, ruri);
      const acct = await google.me(tokens.accessToken);
      await saveConnection(userId, 'google', tokens, { accountId: acct?.sub, username: acct?.email });
      await markConnected(userId, uiPlatform, acct?.email);
    }

    // Jira can snapshot its accessible projects immediately. GitHub and Google
    // need item selection in the UI first.
    if (op === 'jira') {
      runInitialSync(userId, 'jira', []).catch((e) => console.warn('Jira initial sync (non-fatal):', e.message));
    }

    return back('connected', uiPlatform);
  } catch (e: any) {
    console.error(`${op} callback error:`, e.message);
    return back('connect_error');
  }
}
