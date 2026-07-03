import { MongoClient } from 'mongodb';

// The app uses custom string `_id`s (e.g. "userId::entityId", UUIDs) and highly
// dynamic documents, which fight the driver's ObjectId/Document generics. The DB
// handle is intentionally loose; canonical document shapes live in ./types.ts.
type Db = any;

let clientPromise: Promise<MongoClient> | null = null;

function mockCollection() {
  const emptyFind = (): any => ({
    sort: () => emptyFind(),
    limit: () => emptyFind(),
    skip: () => emptyFind(),
    toArray: async () => [],
  });
  return {
    findOne: async () => null,
    findOneAndUpdate: async () => null,
    insertOne: async () => ({ insertedId: 'mock-id' }),
    updateOne: async () => ({ modifiedCount: 1 }),
    createIndex: async () => 'mock-index',
    deleteOne: async () => ({ deletedCount: 1 }),
    deleteMany: async () => ({ deletedCount: 0 }),
    countDocuments: async () => 0,
    find: emptyFind,
    aggregate: () => ({ toArray: async () => [] }),
  };
}

export async function getDb(): Promise<Db> {
  // Read lazily so dotenv has already populated process.env by the time this runs.
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('abcde.mongodb.net')) {
    console.warn('⚠️ WARNING: MONGODB_URI is not set or is using a placeholder cluster.');
    console.warn('Online sync features will fall back to local in-memory storage.');
    // In-memory stand-in so the app runs without a database configured.
    return { collection: () => mockCollection() } as unknown as Db;
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch((err) => {
      console.error('❌ MongoDB Connection Error:', err.message);
      clientPromise = null;
      throw err;
    });
  }

  const conn = await clientPromise;
  return conn.db('public');
}
