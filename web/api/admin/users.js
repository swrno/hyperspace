import { getDb } from '../mongodb.js';
import { verifyToken } from '../auth.js';

export default async function handler(req, res) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  try {
    // Authenticate the request
    const adminUser = await verifyToken(req);
    
    // Verify admin privileges
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access only' });
    }

    const db = await getDb();
    const usersCol = db.collection('users');
    const logsCol = db.collection('message_logs');

    if (req.method === 'GET') {
      const { search } = req.query;
      let query = {};
      
      if (search) {
        query = {
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } }
          ]
        };
      }

      const users = await usersCol.find(query).sort({ createdAt: -1 }).toArray();

      // Enrich user list with their message counts in the last 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const enrichedUsers = await Promise.all(users.map(async (u) => {
        const hourlyCount = await logsCol.countDocuments({
          uid: u.uid,
          timestamp: { $gte: oneHourAgo }
        });
        
        return {
          uid: u.uid,
          email: u.email,
          name: u.name,
          avatar: u.avatar || '',
          tier: u.tier || 'free',
          role: u.role || 'user',
          customHourLimit: u.customHourLimit !== undefined ? u.customHourLimit : null,
          hourlyUsage: hourlyCount,
          createdAt: u.createdAt,
        };
      }));

      return res.status(200).json({ users: enrichedUsers });
    }

    if (req.method === 'POST') {
      const { targetUid, tier, customHourLimit } = req.body || {};
      if (!targetUid) {
        return res.status(400).json({ error: 'Target user UID is required' });
      }

      const updateData = {
        updatedAt: new Date().toISOString()
      };

      if (tier) {
        updateData.tier = tier; // 'free' | 'pro' | 'ultra'
      }

      if (customHourLimit !== undefined) {
        updateData.customHourLimit = customHourLimit === null ? null : Number(customHourLimit);
      }

      await usersCol.updateOne(
        { uid: targetUid },
        { $set: updateData }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/admin/users:', error.message);
    return res.status(error.message.includes('Authorization') ? 401 : 500).json({ 
      error: error.message || 'Authentication failed' 
    });
  }
}
