/**
 * Shared test harness.
 *
 * Boots an in-memory MongoDB (no Atlas, no local install, no credentials),
 * mounts the real Express app, and exposes a supertest agent plus small
 * helpers for creating users and authenticated requests.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import supertest from 'supertest';

// Set required env BEFORE importing anything that reads config.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/placeholder_for_tests';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');

let mongo;

/** Call once per test file (in a `before` hook). */
export async function startTestDatabase() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 10000 });
  return mongo;
}

/** Call once per test file (in an `after` hook). */
export async function stopTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
}

/** Call between tests to guarantee isolation. */
export async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

/**
 * The real Express app, with no listener bound.
 * Forwards options so tests can inject e.g. a temp uploadDir.
 */
export function makeApp(options) {
  return createApp(options);
}

/** A supertest agent bound to the app. */
export function request(app) {
  return supertest(app);
}

/**
 * Registers a user through the real endpoint and returns
 * { user, token, auth } where `auth` is a header object.
 */
export async function createUser(app, overrides = {}) {
  const payload = {
    username: 'tester',
    email: 'tester@example.com',
    password: 'Password123!',
    displayName: 'Test User',
    ...overrides,
  };

  const res = await supertest(app).post('/api/auth/register').send(payload);

  if (res.status !== 201) {
    throw new Error(
      `createUser failed (${res.status}): ${JSON.stringify(res.body)}`
    );
  }

  const { token, user } = res.body;
  return { user, token, auth: { Authorization: `Bearer ${token}` }, payload };
}

/** Convenience: create a post as the given user. */
export async function createPost(app, auth, content = 'Hello world') {
  const res = await supertest(app)
    .post('/api/posts')
    .set(auth)
    .send({ content });

  if (res.status !== 201) {
    throw new Error(
      `createPost failed (${res.status}): ${JSON.stringify(res.body)}`
    );
  }

  return res.body.post;
}
