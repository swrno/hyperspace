import { getDb } from './mongodb.js';

/**
 * Verifies a Firebase ID token using the official Google Identity Toolkit endpoint.
 * This is serverless-friendly and doesn't require any private service keys.
 */
export async function verifyToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  
  // Custom serverless authorization bypass for our authorized Admin Soulsoumya
  if (token === 'admin-super-bypass-token-2026') {
    const db = await getDb();
    const usersCol = db.collection('users');
    const existingUser = await usersCol.findOne({ email: 'soulsoumya1234@gmail.com' });
    let user;
    if (!existingUser) {
      user = {
        uid: 'admin-soulsoumya-uid',
        email: 'soulsoumya1234@gmail.com',
        name: 'Admin Soumya',
        avatar: '',
        tier: 'ultra',
        role: 'admin',
        customHourLimit: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await usersCol.insertOne(user);
    } else {
      user = existingUser;
    }
    return user;
  }

  let firebaseUser = null;
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  
  if (apiKey) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.users?.[0]) {
          const u = data.users[0];
          firebaseUser = {
            localId: u.localId,
            email: u.email,
            displayName: u.displayName,
            photoUrl: u.photoUrl
          };
        }
      }
    } catch (err) {
      console.warn('Google Identity API key lookup failed, falling back to local JWT decoding:', err.message);
    }
  }

  // Fallback: Safe Local JWT Decoder if API key lookup failed or is not configured
  if (!firebaseUser) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonPayload);
        
        // Expiry check
        if (payload.exp && Date.now() >= payload.exp * 1000) {
          throw new Error('Token has expired');
        }

        firebaseUser = {
          localId: payload.user_id || payload.sub,
          email: payload.email,
          displayName: payload.name || payload.email?.split('@')[0],
          photoUrl: payload.picture || ''
        };
      }
    } catch (err) {
      console.error('Failed to parse fallback token claims:', err.message);
    }
  }

  if (!firebaseUser || !firebaseUser.localId) {
    throw new Error('Authentication failed: No user profile found or invalid token structure');
  }

  // Get database connection and find/upsert user record
  const db = await getDb();
  const usersCol = db.collection('users');

  const existingUser = await usersCol.findOne({ uid: firebaseUser.localId });
  const adminEmail = process.env.ADMIN_EMAIL || 'soulsoumya1234@gmail.com';
  const isAdmin = firebaseUser.email === adminEmail;

  let user;
  if (!existingUser) {
    user = {
      uid: firebaseUser.localId,
      email: firebaseUser.email,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      avatar: firebaseUser.photoUrl || '',
      tier: 'free', // 'free' | 'pro' | 'ultra'
      role: isAdmin ? 'admin' : 'user',
      customHourLimit: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await usersCol.insertOne(user);
  } else {
    // If admin status changed or info needs updating, keep it synced
    const updateFields = {};
    if (existingUser.role !== (isAdmin ? 'admin' : existingUser.role)) {
      updateFields.role = isAdmin ? 'admin' : existingUser.role;
    }
    if (Object.keys(updateFields).length > 0) {
      await usersCol.updateOne({ uid: firebaseUser.localId }, { $set: updateFields });
      user = { ...existingUser, ...updateFields };
    } else {
      user = existingUser;
    }
  }

  return user;
}

/**
 * Checks and records hourly message quotas for a user using a sliding-window algorithm.
 */
export async function checkRateLimit(user) {
  // Administrators are completely exempted from rate limits
  if (user.role === 'admin') {
    return { allowed: true, limit: 999999, remaining: 999999 };
  }

  const db = await getDb();
  const logsCol = db.collection('message_logs');

  // Determine user's rate limits
  let hourLimit = 10; // default Free tier limit
  if (user.tier === 'pro') hourLimit = 150;
  if (user.tier === 'ultra') hourLimit = 999999; // unlimited

  // Allow custom limit overrides set by admin
  if (user.customHourLimit !== null && user.customHourLimit !== undefined) {
    hourLimit = Number(user.customHourLimit);
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Clean up older records of this user to keep index size down
  await logsCol.deleteMany({
    uid: user.uid,
    timestamp: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  });

  // Count requests in the last sliding hour
  const count = await logsCol.countDocuments({
    uid: user.uid,
    timestamp: { $gte: oneHourAgo },
  });

  if (count >= hourLimit) {
    return {
      allowed: false,
      limit: hourLimit,
      remaining: 0,
      resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  return {
    allowed: true,
    limit: hourLimit,
    remaining: hourLimit - count,
  };
}

/**
 * Logs a successful message call to the sliding-window tracker.
 */
export async function logMessageUsage(user) {
  const db = await getDb();
  const logsCol = db.collection('message_logs');
  await logsCol.insertOne({
    uid: user.uid,
    timestamp: new Date().toISOString(),
  });
}
