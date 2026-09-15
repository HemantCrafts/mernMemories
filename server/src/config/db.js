import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Connects to MongoDB Atlas.
 * Retries a few times so a slow cluster wake-up (free tier idle spin-down)
 * does not kill the dev server on first boot.
 */
export async function connectDatabase(retries = 3) {
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 10000,
      });

      console.log(`[db] MongoDB connected -> ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (error) {
      const isLast = attempt === retries;
      console.error(`[db] Connection attempt ${attempt}/${retries} failed: ${error.message}`);

      if (isLast) {
        console.error('[db] Could not connect to MongoDB Atlas.');
        console.error('[db] Checklist:');
        console.error('[db]   1. Is MONGODB_URI correct in server/.env?');
        console.error('[db]   2. Is your current IP whitelisted in Atlas > Network Access?');
        console.error('[db]   3. Does the database user password still match?');
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  return null;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  console.log('[db] MongoDB connection closed');
}

/**
 * Connects to an explicit URI, bypassing config/.env.
 * Used by the test suite to point at an in-memory MongoDB instance
 * without needing real credentials in the environment.
 */
export async function connectToUri(uri) {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}
