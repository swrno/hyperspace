import { getDb } from './mongodb.js';
import type { Request, Response } from 'express';
import crypto from 'crypto';

import { verifyToken } from './auth.js';

export default async function appsHandler(req: Request, res: Response) {
  const db = await getDb();
  const appsCollection = db.collection('apps');

  let userId = 'anonymous';
  try {
    const user = await verifyToken(req);
    if (user && user.uid) {
      userId = user.uid;
    }
  } catch (err) {
    // If no token or invalid token, fall back to anonymous or reject.
    // For now, if no auth is provided, we can allow anonymous usage.
    if (req.headers.authorization && req.headers.authorization.length > 10) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method === 'GET') {
    try {
      const apps = await appsCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
      // Remove internal _id or map it.
      const mappedApps = apps.map(app => {
        const { _id, ...rest } = app;
        return rest;
      });
      return res.json(mappedApps);
    } catch (e) {
      console.error('Error fetching apps:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const appData = req.body;
      const appId = crypto.randomUUID();
      const clientId = userId;

      const newApp = {
        ...appData,
        id: appId,
        appId: `app_${appId.replace(/-/g, '')}`,
        clientId,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await appsCollection.insertOne(newApp);
      const { _id, ...rest } = newApp;
      return res.json(rest);
    } catch (e) {
      console.error('Error creating app:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'App ID is required' });

      updates.updatedAt = new Date().toISOString();
      await appsCollection.updateOne({ id, userId }, { $set: updates });
      return res.json({ success: true });
    } catch (e) {
      console.error('Error updating app:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'App ID is required' });

      await appsCollection.deleteOne({ id, userId });
      return res.json({ success: true });
    } catch (e) {
      console.error('Error deleting app:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
