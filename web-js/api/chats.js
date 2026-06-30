import { getDb } from './mongodb.js';
import { verifyToken } from './auth.js';

export default async function handler(req, res) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    // Authenticate the request
    const user = await verifyToken(req);
    const db = await getDb();
    const chatsCol = db.collection('chats');

    if (req.method === 'GET') {
      // Get all chats for the user sorted by last active
      const chats = await chatsCol
        .find({ userId: user.uid })
        .sort({ updatedAt: -1 })
        .toArray();

      // Convert DB documents to client-friendly models (e.g. mapping _id to id)
      const formattedChats = chats.map(c => ({
        id: c._id,
        title: c.title,
        messages: c.messages || [],
        model: c.model || 'sai-1.0',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));

      return res.status(200).json({ 
        chats: formattedChats, 
        user: { 
          role: user.role || 'user', 
          tier: user.tier || 'free' 
        } 
      });
    }

    if (req.method === 'POST') {
      const { chat } = req.body || {};
      if (!chat || !chat.id) {
        return res.status(400).json({ error: 'Chat details are required' });
      }

      // Upsert the chat document
      const result = await chatsCol.updateOne(
        { _id: chat.id, userId: user.uid },
        {
          $set: {
            title: chat.title,
            messages: chat.messages || [],
            model: chat.model || 'sai-1.0',
            createdAt: chat.createdAt || new Date().toISOString(),
            updatedAt: chat.updatedAt || new Date().toISOString(),
          },
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true, upserted: result.upsertedCount > 0 });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Chat ID is required' });
      }

      await chatsCol.deleteOne({ _id: id, userId: user.uid });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/chats:', error.message);
    return res.status(error.message.includes('Authorization') ? 418 : 500).json({ 
      error: error.message || 'Authentication failed' 
    });
  }
}
