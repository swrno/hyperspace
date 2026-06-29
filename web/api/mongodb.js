import { MongoClient } from 'mongodb';

let clientPromise = null;

function mockCollection() {
  const emptyFind = () => ({
    sort: () => emptyFind(),
    limit: () => emptyFind(),
    skip: () => emptyFind(),
    toArray: async () => [],
  });
  return {
    findOne: async () => null,
    insertOne: async () => ({ insertedId: 'mock-id' }),
    updateOne: async () => ({ modifiedCount: 1 }),
    deleteOne: async () => ({ deletedCount: 1 }),
    deleteMany: async () => ({ deletedCount: 0 }),
    countDocuments: async () => 0,
    find: emptyFind,
    aggregate: () => ({ toArray: async () => [] }),
  };
}

export async function getDb() {
  // Read lazily so dotenv has already populated process.env by the time this runs.
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('abcde.mongodb.net')) {
    console.warn('⚠️ WARNING: MONGODB_URI is not set or is using a placeholder cluster.');
    console.warn('Online sync features will fall back to local in-memory storage.');
    return { collection: () => mockCollection() };
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch(err => {
      console.error('❌ MongoDB Connection Error:', err.message);
      clientPromise = null;
      throw err;
    });
  }

  const conn = await clientPromise;
  return conn.db('public');
}
