/**
 * Authentication for the public hyper-sdk surface (api/sdk.ts) — distinct from
 * verifyToken() (Firebase, used everywhere else for the app *owner*). Callers
 * here are third-party integrations, identified by an (apiKey, appId,
 * clientId) triple that must all belong to the same app document, plus a
 * caller-supplied `userId` naming their own end-user.
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
  const app = await db.collection('apps').findOne({ appId, apiKey, clientId });
  if (!app) {
    throw new SdkAuthError(401, 'Invalid apiKey, appId, or clientId');
  }
  return { app, userId };
}
