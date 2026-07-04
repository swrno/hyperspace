/**
 * End-users of a third-party integration (an app built with the SDK), as
 * distinct from the app *owner* (the hypr account that created the app and
 * is authenticated via Firebase everywhere else in this codebase).
 *
 * Schema:
 *   app_users    — one doc per (appId, userId): "users, scoped under an app."
 *   conversations — one doc per (appId, userId, sessionId): raw message log,
 *                   "conversations, scoped under a user."
 */
import { getDb } from '../mongodb.js';

export interface AppUser {
  _id: string; // `${appId}::${userId}`
  appId: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  turnCount: number;
}

/** Look up an end-user of an app, creating the record on first contact. */
export async function ensureAppUser(appId: string, userId: string): Promise<AppUser> {
  const db = await getDb();
  const _id = `${appId}::${userId}`;
  const now = new Date().toISOString();
  const existing = await db.collection('app_users').findOne({ _id });
  if (existing) {
    await db.collection('app_users').updateOne({ _id }, { $set: { lastActiveAt: now }, $inc: { turnCount: 1 } });
    return existing;
  }
  const doc: AppUser = { _id, appId, userId, createdAt: now, lastActiveAt: now, turnCount: 1 };
  await db.collection('app_users').insertOne(doc);
  return doc;
}

/** List all end-users of an app (most recently active first). */
export async function listAppUsers(appId: string): Promise<AppUser[]> {
  const db = await getDb();
  return db.collection('app_users').find({ appId }).sort({ lastActiveAt: -1 }).limit(500).toArray();
}

/** Append messages to a (app, user, session) conversation, creating it if needed. */
export async function appendConversationTurn(
  appId: string, userId: string, sessionId: string, messages: any[],
): Promise<void> {
  const db = await getDb();
  const _id = `${appId}::${userId}::${sessionId}`;
  const now = new Date().toISOString();
  await db.collection('conversations').updateOne(
    { _id },
    {
      $setOnInsert: { appId, userId, sessionId, createdAt: now },
      $set: { updatedAt: now },
      $push: { messages: { $each: messages } },
    },
    { upsert: true },
  );
}

/** List conversation sessions for one end-user of an app (most recent first). */
export async function listUserConversations(appId: string, userId: string): Promise<any[]> {
  const db = await getDb();
  return db.collection('conversations').find({ appId, userId }).sort({ updatedAt: -1 }).toArray();
}

/** Fetch a single conversation by (app, user, session). */
export async function getConversation(appId: string, userId: string, sessionId: string): Promise<any | null> {
  const db = await getDb();
  return db.collection('conversations').findOne({ _id: `${appId}::${userId}::${sessionId}` });
}
