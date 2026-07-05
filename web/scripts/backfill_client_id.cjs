// One-off migration: apps created before clientId was tied to the owner's
// uid have no `clientId` field, so hypr-sdk auth (sdkAuth.ts) can never match
// them. Backfills clientId = userId on any app doc missing it.
//
// Usage: node scripts/backfill_client_id.cjs
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const { MongoClient } = require('mongodb');

async function backfill() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('public');

  const apps = await db
    .collection('apps')
    .find({ $or: [{ clientId: { $exists: false } }, { clientId: null }] })
    .toArray();

  console.log(`Found ${apps.length} app(s) missing clientId.`);

  for (const app of apps) {
    await db.collection('apps').updateOne({ _id: app._id }, { $set: { clientId: app.userId } });
    console.log(` -> Backfilled ${app.appId || app.id} -> clientId=${app.userId}`);
  }

  console.log('Done.');
  await client.close();
}

backfill().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
