import { getDb } from './mongodb.js';
import { encrypt, decrypt, randomToken } from './lib/crypto.js';
import * as jira from './lib/jira.js';
import * as google from './lib/google.js';

/**
 * Data layer for provider connections — the MongoDB equivalent of the PDF's
 * `integration_connections` Postgres table.
 *
 * Collections:
 *   integration_connections  — one doc per (userId, provider); tokens encrypted
 *   oauth_states             — short-lived CSRF state for the OAuth handshake
 *
 * Tokens are NEVER stored in plaintext: access/refresh tokens are encrypted via
 * lib/crypto before write and decrypted only when an API call needs them.
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function col(db) {
  return db.collection('integration_connections');
}

// ── OAuth CSRF state ─────────────────────────────────────────────────────────

export async function createOAuthState(userId, provider) {
  const db = await getDb();
  const state = randomToken(24);
  await db.collection('oauth_states').insertOne({
    state,
    userId,
    provider,
    createdAt: new Date().toISOString(),
  });
  return state;
}

/** Validate + consume a state token (single use, must be recent). */
export async function consumeOAuthState(state) {
  const db = await getDb();
  const states = db.collection('oauth_states');
  const doc = await states.findOne({ state });
  if (!doc) return null;
  await states.deleteOne({ state });
  if (Date.now() - new Date(doc.createdAt).getTime() > STATE_TTL_MS) return null;
  return { userId: doc.userId, provider: doc.provider };
}

// ── Connection CRUD ──────────────────────────────────────────────────────────

export async function getConnection(userId, provider) {
  const db = await getDb();
  return col(db).findOne({ userId, provider });
}

export async function listConnections(userId) {
  const db = await getDb();
  return col(db).find({ userId }).toArray();
}

/**
 * Persist a freshly authorized connection (tokens encrypted at rest).
 * `tokens` = { accessToken, refreshToken?, expiresIn?, scope? }
 * `identity` = { accountId, username, cloudId?, siteUrl?, siteName? }
 */
export async function saveConnection(userId, provider, tokens, identity = {}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null;

  const doc = {
    userId,
    provider,
    providerAccountId: identity.accountId || null,
    providerUsername: identity.username || null,
    cloudId: identity.cloudId || null,
    siteUrl: identity.siteUrl || null,
    siteName: identity.siteName || null,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: encrypt(tokens.refreshToken),
    tokenExpiresAt: expiresAt,
    scopes: tokens.scope || null,
    status: 'active',
    updatedAt: now,
  };

  await col(db).updateOne(
    { userId, provider },
    { $set: doc, $setOnInsert: { createdAt: now, initialSyncStatus: 'pending' } },
    { upsert: true }
  );
  return getConnection(userId, provider);
}

export async function updateConnection(userId, provider, fields) {
  const db = await getDb();
  await col(db).updateOne(
    { userId, provider },
    { $set: { ...fields, updatedAt: new Date().toISOString() } }
  );
}

export async function setSyncState(userId, provider, state) {
  // state: { initialSyncStatus?, lastPollCursor?, lastSyncAt?, entityCount?, error? }
  await updateConnection(userId, provider, state);
}

export async function deleteConnection(userId, provider) {
  const db = await getDb();
  await col(db).deleteOne({ userId, provider });
}

/**
 * Return a usable access token for a connection, transparently refreshing
 * (and persisting the rotated tokens) when it is expired/expiring — this is the
 * "token refresh middleware" from §2 of the architecture, applied to Jira.
 */
export async function getAccessToken(connection) {
  if (!connection) return null;
  const access = decrypt(connection.accessTokenEnc);

  // GitHub tokens are long-lived — no refresh. Jira + Google expire in ~1h.
  const refresher = connection.provider === 'jira' ? jira.refresh
    : connection.provider === 'google' ? google.refresh
    : null;
  if (!refresher) return access;

  const expiringSoon =
    connection.tokenExpiresAt &&
    new Date(connection.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000;

  if (!expiringSoon) return access;

  const refreshTok = decrypt(connection.refreshTokenEnc);
  if (!refreshTok) return access; // nothing to refresh with

  try {
    const next = await refresher(refreshTok);
    await updateConnection(connection.userId, connection.provider, {
      accessTokenEnc: encrypt(next.accessToken),
      refreshTokenEnc: encrypt(next.refreshToken), // Jira rotates; Google reuses
      tokenExpiresAt: new Date(Date.now() + next.expiresIn * 1000).toISOString(),
      status: 'active',
    });
    return next.accessToken;
  } catch (e) {
    if (e.revoked) {
      await updateConnection(connection.userId, connection.provider, { status: 'revoked' });
      console.warn(`${connection.provider} connection revoked for user ${connection.userId}`);
    }
    throw e;
  }
}
