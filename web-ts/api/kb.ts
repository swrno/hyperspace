import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';
import { ingest as cogneeIngest } from './cognee.js';
import { textFromBase64 } from './lib/pdf.js';

/**
 * Knowledge Base endpoint.
 *
 * Per user, stores named knowledge bases and the documents inside them.
 * Documents are lightweight here (pasted text or a resource link) so the
 * flow works end to end without external file storage. Mirrors the storage
 * pattern used by /api/chats.
 *
 * Routes (all on /api/kb):
 *   GET                                  -> { kbs: [...] }
 *   POST { action:'create', kb }         -> create a knowledge base
 *   POST { action:'add-doc', kbId, doc } -> append a document
 *   POST { action:'delete-doc', kbId, docId }
 *   POST { action:'rename', kbId, name, description }
 *   DELETE ?id=<kbId>                    -> remove a knowledge base
 */

const newId = () =>
  'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

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
    const kbCol = db.collection('knowledge_bases');

    if (req.method === 'GET') {
      const kbs = await kbCol
        .find({ userId: user.uid })
        .sort({ updatedAt: -1 })
        .toArray();

      const formatted = kbs.map((k) => ({
        id: k._id,
        name: k.name,
        description: k.description || '',
        documents: k.documents || [],
        createdAt: k.createdAt,
        updatedAt: k.updatedAt,
      }));

      return res.status(200).json({ kbs: formatted });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'create';
      const now = new Date().toISOString();

      if (action === 'create') {
        const name = (body.kb?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'A name is required' });
        const doc = {
          _id: newId(),
          userId: user.uid,
          name,
          description: (body.kb?.description || '').trim(),
          documents: [],
          createdAt: now,
          updatedAt: now,
        };
        await kbCol.insertOne(doc);
        return res.status(200).json({ success: true, id: doc._id, kb: { ...doc, id: doc._id } });
      }

      if (action === 'add-doc') {
        const { kbId, doc } = body;
        if (!kbId || !doc?.name) {
          return res.status(400).json({ error: 'kbId and a document name are required' });
        }
        // Text arrives inline for text files; PDFs/binaries arrive as base64 and
        // are extracted server-side so the LLM sees real content, not an empty stub.
        let content = String(doc.content || '');
        if (!content && doc.contentBase64) {
          content = await textFromBase64(doc.contentBase64, doc.name);
        }
        const entry = {
          id: newId(),
          name: String(doc.name).slice(0, 160),
          type: doc.type || 'text',
          size: content.length,
          preview: content.slice(0, 240),
          content: content.slice(0, 100000),
          status: content.trim() ? 'ready' : 'empty',
          createdAt: now,
        };
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $push: { documents: entry }, $set: { updatedAt: now } }
        );

        // Stage into Cognee + trigger graph extraction (cognify) so chat can
        // reason over this document.
        if (content.trim()) {
          const header = `# Knowledge Base Document: ${entry.name}\n\n`;
          cogneeIngest(header + content.slice(0, 100000), {
            userId: user.uid,
            nodeSet: ['kb'],
          }).catch((e) => console.warn('KB Cognee ingest failed (non-fatal):', e.message));
        }

        return res.status(200).json({ success: true, doc: entry, parsed: content.trim().length });
      }

      if (action === 'delete-doc') {
        const { kbId, docId } = body;
        if (!kbId || !docId) {
          return res.status(400).json({ error: 'kbId and docId are required' });
        }
        await kbCol.updateOne(
          { _id: kbId, userId: user.uid },
          { $pull: { documents: { id: docId } }, $set: { updatedAt: now } }
        );
        return res.status(200).json({ success: true });
      }

      if (action === 'rename') {
        const { kbId, name, description } = body;
        if (!kbId) return res.status(400).json({ error: 'kbId is required' });
        const fields: Record<string, any> = { updatedAt: now };
        if (typeof name === 'string' && name.trim()) fields.name = name.trim();
        if (typeof description === 'string') fields.description = description.trim();
        await kbCol.updateOne({ _id: kbId, userId: user.uid }, { $set: fields });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Knowledge base ID is required' });
      await kbCol.deleteOne({ _id: id, userId: user.uid });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/kb:', error.message);
    return res
      .status(error.message.includes('Authorization') ? 418 : 500)
      .json({ error: error.message || 'Authentication failed' });
  }
}
