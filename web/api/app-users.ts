/**
 * Owner-facing view of an app's end-users and their conversations — for the
 * "Chat history" tab in the app management UI. Firebase-authenticated (the
 * app owner), unlike api/sdk.ts which end-users' own apps call directly.
 *
 * GET /api/app-users?appId=X               → list end-users of this app
 * GET /api/app-users?appId=X&userId=Y      → that user's conversation sessions
 */
import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { listAppUsers, listUserConversations } from './lib/appUsers.js';

export default async function appUsersHandler(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);
    const appId = req.query?.appId as string | undefined;
    const targetUserId = req.query?.userId as string | undefined;
    if (!appId) return res.status(400).json({ error: 'appId is required' });

    const db = await getDb();
    const app = await db.collection('apps').findOne({ appId, userId: user.uid });
    if (!app) return res.status(404).json({ error: 'App not found' });

    if (targetUserId) {
      const conversations = await listUserConversations(appId, targetUserId);
      return res.status(200).json({ conversations });
    }

    const users = await listAppUsers(appId);
    return res.status(200).json({ users });
  } catch (error: any) {
    console.error('Error in /api/app-users:', error.message);
    const status = error.message.includes('Authorization') ? 418 : 500;
    return res.status(status).json({ error: error.message || 'Failed to load app users' });
  }
}
