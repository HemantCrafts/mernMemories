import mongoose from 'mongoose';
import { config, isProduction } from './env.js';

/**
 * Turns a Mongoose connection error into a specific cause and fix.
 *
 * Mongoose reports every connection failure as "Could not connect to any
 * servers in your MongoDB Atlas cluster" and then names three possible
 * reasons, which is not much help when a deploy is failing. The underlying
 * message usually identifies the real cause, so classify it.
 *
 * @returns {string[]} lines to print
 */
export function diagnoseConnectionFailure(error) {
  const message = error.message || '';

  // Atlas reports a blocked source IP with this specific wording. It is by far
  // the most common failure on a PaaS, and it is distinct from a credentials
  // failure, which says "bad auth".
  if (/whitelist|Could not connect to any servers/i.test(message)) {
    return [
      'Cause: Atlas refused the connection from this IP address.',
      ...(isProduction
        ? [
            'Fix: add 0.0.0.0/0 in Atlas > Security > Network Access.',
            '     Render has no fixed outbound IP on the free tier, so the',
            '     whole range must be allowed. The password still protects it.',
          ]
        : ['Fix: add your current IP in Atlas > Security > Network Access.']),
    ];
  }

  if (/bad auth|Authentication failed|auth failed/i.test(message)) {
    return [
      'Cause: Atlas rejected the credentials.',
      'Fix: check the database user password inside MONGODB_URI.',
      '     If the password contains @ : / or #, it must be URL-encoded.',
    ];
  }

  if (/ENOTFOUND|querySrv|getaddrinfo|EAI_AGAIN/i.test(message)) {
    return [
      'Cause: the cluster hostname could not be resolved.',
      'Fix: check MONGODB_URI for a typo in the cluster address.',
    ];
  }

  // A server-selection timeout is ambiguous - it covers a blocked IP, a paused
  // cluster, and a network that drops outbound 27017. Name all three, allowlist
  // first because it is the most likely on a host.
  if (/Server selection timed out|timed out|ETIMEDOUT/i.test(message)) {
    return [
      'Cause: no Atlas server responded before the timeout.',
      'Fix: in order of likelihood -',
      '     1. add this host to Atlas > Security > Network Access',
      '     2. confirm the cluster is not paused',
      '     3. confirm outbound TCP 27017 is allowed',
    ];
  }

  return [
    'Fix: check MONGODB_URI, the Atlas IP allowlist, and the database user password.',
  ];
}

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
        console.error('');
        console.error('[db] Could not connect to MongoDB.');
        for (const line of diagnoseConnectionFailure(error)) {
          console.error(`[db] ${line}`);
        }
        console.error(
          isProduction
            ? '[db] Set these in your hosting dashboard, not in a .env file.'
            : '[db] Set these in server/.env.',
        );
        console.error('');
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
