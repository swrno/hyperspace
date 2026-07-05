/**
 * hypr API key management — owned by the Firebase user (not per-app). A user
 * can hold multiple keys; any one of them authenticates hypr-sdk calls for
 * any app that user owns (see lib/sdkAuth.ts).
 *
 * GET    /api/api-keys       → list this user's keys (masked, never the secret)
 * POST   /api/api-keys       → create a key, returns the full secret ONCE
 * DELETE /api/api-keys       → revoke a key by id (body: { id })
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';

const maskKey = (key: string) => `${key.slice(0, 11)}${'•'.repeat(14)}${key.slice(-4)}`;

export default async function apiKeysHandler(req: Request, res: Response) {
  let user;
  try {
    user = await verifyToken(req);
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Unauthorized' });
  }

  const db = await getDb();
  const keysCollection = db.collection('api_keys');

  if (req.method === 'GET') {
    try {
      const keys = await keysCollection
        .find({ userId: user.uid })
        .sort({ createdAt: -1 })
        .toArray();
      const masked = keys.map(({ _id, key, ...rest }: any) => ({ ...rest, preview: maskKey(key) }));
      return res.json(masked);
    } catch (e) {
      console.error('Error listing API keys:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, expiresInDays } = req.body || {};
      const id = `key_${crypto.randomUUID()}`;
      const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
      const now = new Date().toISOString();
      const expiresAt = expiresInDays == null
        ? null
        : new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString();

      const doc = {
        id,
        userId: user.uid,
        name: (name || '').trim() || 'Untitled key',
        key,
        createdAt: now,
        expiresAt,
      };
      await keysCollection.insertOne(doc);
      // Full secret is returned only in this response — never again.
      return res.json({ id, name: doc.name, key, createdAt: now, expiresAt });
    } catch (e) {
      console.error('Error creating API key:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      await keysCollection.deleteOne({ id, userId: user.uid });
      return res.json({ success: true });
    } catch (e) {
      console.error('Error revoking API key:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
