import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import {
  startTestDatabase,
  stopTestDatabase,
  clearDatabase,
  makeApp,
  createUser,
} from './setup.js';

const app = makeApp();

before(startTestDatabase);
after(stopTestDatabase);
beforeEach(clearDatabase);

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password123!',
      displayName: 'New User',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token, 'expected a token');
    assert.equal(res.body.user.username, 'newuser');
    assert.equal(res.body.user.displayName, 'New User');
    assert.equal(res.body.user.followerCount, 0);
  });

  it('never returns the password hash', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'nopass',
      email: 'nopass@example.com',
      password: 'Password123!',
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.password, undefined);
    assert.ok(!JSON.stringify(res.body).includes('$2a$'), 'hash leaked in response');
    assert.ok(!JSON.stringify(res.body).includes('$2b$'), 'hash leaked in response');
  });

  it('defaults displayName to the username when omitted', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'plainjane',
      email: 'jane@example.com',
      password: 'Password123!',
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.displayName, 'plainjane');
  });

  it('rejects a duplicate username with 409', async () => {
    await createUser(app, { username: 'dup', email: 'first@example.com' });

    const res = await supertest(app).post('/api/auth/register').send({
      username: 'dup',
      email: 'second@example.com',
      password: 'Password123!',
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already registered/i);
  });

  it('rejects a duplicate email with 409', async () => {
    await createUser(app, { username: 'first', email: 'same@example.com' });

    const res = await supertest(app).post('/api/auth/register').send({
      username: 'second',
      email: 'same@example.com',
      password: 'Password123!',
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already registered/i);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'incomplete',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /required/i);
  });

  it('rejects a short password with 400', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'shortpass',
      email: 'short@example.com',
      password: 'abc',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.details.some((d) => d.field === 'password'));
  });

  it('rejects an invalid email with 400', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'bademail',
      email: 'not-an-email',
      password: 'Password123!',
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d) => d.field === 'email'));
  });

  it('rejects invalid username characters with 400', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      username: 'bad user!',
      email: 'badchar@example.com',
      password: 'Password123!',
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d) => d.field === 'username'));
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createUser(app, {
      username: 'loginuser',
      email: 'login@example.com',
      password: 'Password123!',
    });
  });

  it('logs in by username', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'loginuser', password: 'Password123!' });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'loginuser');
  });

  it('logs in by email', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'login@example.com', password: 'Password123!' });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('accepts the legacy `email` field name', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password123!' });

    assert.equal(res.status, 200);
  });

  it('is case-insensitive on email', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'LOGIN@EXAMPLE.COM', password: 'Password123!' });

    assert.equal(res.status, 200);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'loginuser', password: 'WrongPassword!' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid credentials');
  });

  it('rejects an unknown user with the same message (no enumeration)', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'ghost', password: 'Password123!' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid credentials');
  });

  it('rejects a missing password with 400', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ identifier: 'loginuser' });

    assert.equal(res.status, 400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { auth, user } = await createUser(app);

    const res = await supertest(app).get('/api/auth/me').set(auth);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, user.username);
    assert.equal(res.body.user.password, undefined);
  });

  it('rejects a missing token with 401', async () => {
    const res = await supertest(app).get('/api/auth/me');

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Authentication required');
  });

  it('rejects a malformed token with 401', async () => {
    const res = await supertest(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer not.a.jwt' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  it('rejects a non-Bearer scheme with 401', async () => {
    const res = await supertest(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Basic abc123' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Authentication required');
  });
});
