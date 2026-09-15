import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import {
  startTestDatabase,
  stopTestDatabase,
  clearDatabase,
  makeApp,
  createUser,
  createPost,
} from './setup.js';

const app = makeApp();

before(startTestDatabase);
after(stopTestDatabase);
beforeEach(clearDatabase);

describe('GET /api/users/:username', () => {
  it('returns a public profile with post count', async () => {
    const { auth, user } = await createUser(app, {
      username: 'profileuser',
      email: 'p@example.com',
      displayName: 'Profile User',
    });
    await createPost(app, auth, 'One');
    await createPost(app, auth, 'Two');

    const res = await supertest(app).get('/api/users/profileuser');

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'profileuser');
    assert.equal(res.body.user.displayName, 'Profile User');
    assert.equal(res.body.user.postCount, 2);
    assert.equal(res.body.user.isFollowedByViewer, false);
    assert.equal(res.body.user.password, undefined);
  });

  it('returns 404 for an unknown username', async () => {
    const res = await supertest(app).get('/api/users/nobody-here');

    assert.equal(res.status, 404);
  });

  it('marks isSelf correctly for the owner', async () => {
    const { auth } = await createUser(app, { username: 'myself', email: 'me@example.com' });

    const res = await supertest(app).get('/api/users/myself').set(auth);

    assert.equal(res.body.user.isSelf, true);
  });

  it('marks isFollowedByViewer for a follower', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);

    const res = await supertest(app).get('/api/users/bob').set(alice.auth);

    assert.equal(res.body.user.isFollowedByViewer, true);
  });
});

describe('GET /api/users', () => {
  it('lists users', async () => {
    await createUser(app, { username: 'alice', email: 'a@example.com' });
    await createUser(app, { username: 'bob', email: 'b@example.com' });

    const res = await supertest(app).get('/api/users');

    assert.equal(res.status, 200);
    assert.equal(res.body.users.length, 2);
  });

  it('searches by username', async () => {
    await createUser(app, { username: 'alice', email: 'a@example.com' });
    await createUser(app, { username: 'bob', email: 'b@example.com' });

    const res = await supertest(app).get('/api/users?q=ali');

    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].username, 'alice');
  });

  it('searches by display name', async () => {
    await createUser(app, {
      username: 'alice',
      email: 'a@example.com',
      displayName: 'Wonderland Alice',
    });
    await createUser(app, { username: 'bob', email: 'b@example.com', displayName: 'Bob' });

    const res = await supertest(app).get('/api/users?q=Wonderland');

    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].username, 'alice');
  });

  it('is case-insensitive', async () => {
    await createUser(app, { username: 'alice', email: 'a@example.com' });

    const res = await supertest(app).get('/api/users?q=ALICE');

    assert.equal(res.body.users.length, 1);
  });

  it('treats regex metacharacters as literal text (no ReDoS / wildcard)', async () => {
    await createUser(app, { username: 'alice', email: 'a@example.com' });
    await createUser(app, { username: 'bob', email: 'b@example.com' });

    // A raw regex would match everything; escaped, it must match nothing.
    const res = await supertest(app).get('/api/users?q=.*');

    assert.equal(res.body.users.length, 0);
  });

  it('returns an empty list for no matches', async () => {
    await createUser(app, { username: 'alice', email: 'a@example.com' });

    const res = await supertest(app).get('/api/users?q=zzzzzz');

    assert.equal(res.body.users.length, 0);
    assert.equal(res.body.total, 0);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates displayName, bio and avatarUrl', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .patch('/api/users/me')
      .set(auth)
      .send({
        displayName: 'Updated Name',
        bio: 'My bio',
        avatarUrl: '/uploads/1700000000000-abc123.png',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.displayName, 'Updated Name');
    assert.equal(res.body.user.bio, 'My bio');
    assert.equal(res.body.user.avatarUrl, '/uploads/1700000000000-abc123.png');
  });

  it('rejects an arbitrary remote avatarUrl', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .patch('/api/users/me')
      .set(auth)
      .send({ avatarUrl: 'https://evil.example.com/tracker.gif' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid avatarUrl/i);
  });

  it('persists the change across requests', async () => {
    const { auth } = await createUser(app);

    await supertest(app).patch('/api/users/me').set(auth).send({ bio: 'Persisted' });
    const res = await supertest(app).get('/api/auth/me').set(auth);

    assert.equal(res.body.user.bio, 'Persisted');
  });

  it('requires authentication', async () => {
    const res = await supertest(app).patch('/api/users/me').send({ bio: 'Nope' });

    assert.equal(res.status, 401);
  });

  it('ignores fields that are not allowed (no privilege escalation)', async () => {
    const { auth, user } = await createUser(app, { username: 'alice', email: 'a@example.com' });

    const res = await supertest(app)
      .patch('/api/users/me')
      .set(auth)
      .send({ username: 'hacked', email: 'hacked@example.com', followers: ['fake'] });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice');

    // Confirm in the database, not just the response.
    const check = await supertest(app).get(`/api/users/${user.username}`);
    assert.equal(check.body.user.username, 'alice');
    assert.equal(check.body.user.followerCount, 0);
  });

  it('rejects a bio over 160 characters', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .patch('/api/users/me')
      .set(auth)
      .send({ bio: 'x'.repeat(161) });

    assert.equal(res.status, 400);
  });
});

describe('POST /api/users/:id/follow', () => {
  it('follows a user and updates both sides', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    const res = await supertest(app)
      .post(`/api/users/${bob.user.id}/follow`)
      .set(alice.auth);

    assert.equal(res.status, 200);
    assert.equal(res.body.following, true);
    assert.equal(res.body.followerCount, 1);
    assert.equal(res.body.followingCount, 1);

    const bobProfile = await supertest(app).get('/api/users/bob');
    const aliceProfile = await supertest(app).get('/api/users/alice');
    assert.equal(bobProfile.body.user.followerCount, 1);
    assert.equal(aliceProfile.body.user.followingCount, 1);
  });

  it('unfollows on second call (toggle)', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);
    const res = await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);

    assert.equal(res.body.following, false);
    assert.equal(res.body.followerCount, 0);
  });

  it('refuses to let a user follow themselves', async () => {
    const { auth, user } = await createUser(app);

    const res = await supertest(app).post(`/api/users/${user.id}/follow`).set(auth);

    assert.equal(res.status, 400);
    assert.match(res.body.message, /cannot follow yourself/i);
  });

  it('returns 404 for a nonexistent target', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/users/507f1f77bcf86cd799439011/follow')
      .set(auth);

    assert.equal(res.status, 404);
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app).post('/api/users/garbage/follow').set(auth);

    assert.equal(res.status, 400);
  });

  it('requires authentication', async () => {
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    const res = await supertest(app).post(`/api/users/${bob.user.id}/follow`);

    assert.equal(res.status, 401);
  });

  it('does not duplicate the relationship on repeated follows', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    // follow, unfollow, follow
    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);
    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);
    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);

    const res = await supertest(app).get('/api/users/bob');
    assert.equal(res.body.user.followerCount, 1);
  });
});
