/**
 * Authentication for the public hypr-sdk surface (api/sdk.ts) — distinct from
 * verifyToken() (Firebase, used everywhere else for the app *owner*). Callers
 * here are third-party integrations, identified by an (apiKey, appId,
 * clientId) triple, plus a caller-supplied `userId` naming their own
 * end-user.
 *
 * Unlike appId/clientId (generated per-app), apiKey is owned by a hypr *user*
 * account (see api/api-keys.ts) and not tied to any one app — any of that
 * user's keys authenticates any app they own. So validation is two-step:
 * resolve apiKey -> owning user, then confirm that user owns appId/clientId.
 */
import type { Request } from 'express';
import { getDb } from '../mongodb.js';

export interface SdkAuthResult {
  app: any;
  userId: string;
}

export class SdkAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function verifySdkAuth(req: Request): Promise<SdkAuthResult> {
  const apiKey = (req.headers['x-api-key'] as string) || req.body?.apiKey;
  const appId = (req.headers['x-app-id'] as string) || req.body?.appId;
  const clientId = (req.headers['x-client-id'] as string) || req.body?.clientId;
  const userId = req.body?.userId;

  if (!apiKey || !appId || !clientId) {
    throw new SdkAuthError(401, 'apiKey, appId, and clientId are required');
  }
  if (!userId || typeof userId !== 'string') {
    throw new SdkAuthError(400, 'userId is required (identifies your end-user)');
  }

  const db = await getDb();
  const keyDoc = await db.collection('api_keys').findOne({ key: apiKey });
  if (!keyDoc || (keyDoc.expiresAt && new Date(keyDoc.expiresAt).getTime() < Date.now())) {
    throw new SdkAuthError(401, 'Invalid or expired apiKey');
  }

  const app = await db.collection('apps').findOne({ appId, clientId, userId: keyDoc.userId });
  if (!app) {
    throw new SdkAuthError(401, 'Invalid apiKey, appId, or clientId');
  }
  return { app, userId };
}
