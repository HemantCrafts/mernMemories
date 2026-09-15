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

describe('POST /api/posts', () => {
  it('creates a post for an authenticated user', async () => {
    const { auth, user } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'My first post' });

    assert.equal(res.status, 201);
    assert.equal(res.body.post.content, 'My first post');
    assert.equal(res.body.post.author.username, user.username);
    assert.equal(res.body.post.likeCount, 0);
    assert.equal(res.body.post.commentCount, 0);
    assert.equal(res.body.post.isOwnPost, true);
    assert.equal(res.body.post.likedByViewer, false);
  });

  it('requires authentication', async () => {
    const res = await supertest(app)
      .post('/api/posts')
      .send({ content: 'Anonymous' });

    assert.equal(res.status, 401);
  });

  it('rejects empty content with 400', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app).post('/api/posts').set(auth).send({ content: '   ' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /cannot be empty/i);
  });

  it('rejects content over 560 characters with 400', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x'.repeat(561) });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.details.some((d) => d.field === 'content'));
  });

  it('accepts an imageUrl that points at a server-stored upload', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'With image', imageUrl: '/uploads/1700000000000-abc123.jpg' });

    assert.equal(res.status, 201);
    assert.equal(res.body.post.imageUrl, '/uploads/1700000000000-abc123.jpg');
  });

  it('rejects an arbitrary remote imageUrl (tracking pixel vector)', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'Tracking pixel', imageUrl: 'https://evil.example.com/pixel.gif' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid imageUrl/i);
  });

  it('trims leading and trailing whitespace', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts')
      .set(auth)
      .send({ content: '  padded  ' });

    assert.equal(res.status, 201);
    assert.equal(res.body.post.content, 'padded');
  });
});

describe('GET /api/posts', () => {
  it('returns posts newest first', async () => {
    const { auth } = await createUser(app);
    await createPost(app, auth, 'First');
    await new Promise((r) => setTimeout(r, 12));
    await createPost(app, auth, 'Second');

    const res = await supertest(app).get('/api/posts');

    assert.equal(res.status, 200);
    assert.equal(res.body.posts.length, 2);
    assert.equal(res.body.posts[0].content, 'Second');
    assert.equal(res.body.posts[1].content, 'First');
    assert.equal(res.body.total, 2);
  });

  it('works without authentication', async () => {
    const { auth } = await createUser(app);
    await createPost(app, auth, 'Public post');

    const res = await supertest(app).get('/api/posts');

    assert.equal(res.status, 200);
    assert.equal(res.body.posts.length, 1);
    assert.equal(res.body.posts[0].likedByViewer, false);
  });

  it('filters by author', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });

    await createPost(app, alice.auth, 'Alice post');
    await createPost(app, bob.auth, 'Bob post');

    const res = await supertest(app).get(`/api/posts?author=${alice.user.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.posts.length, 1);
    assert.equal(res.body.posts[0].content, 'Alice post');
  });

  it('rejects an invalid author id with 400', async () => {
    const res = await supertest(app).get('/api/posts?author=not-an-objectid');

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid author id/i);
  });

  it('paginates with pageSize 20', async () => {
    const { auth } = await createUser(app);

    for (let i = 0; i < 25; i += 1) {
      await createPost(app, auth, `Post ${i}`);
    }

    const first = await supertest(app).get('/api/posts?page=1');
    const second = await supertest(app).get('/api/posts?page=2');

    assert.equal(first.body.posts.length, 20);
    assert.equal(first.body.hasMore, true);
    assert.equal(second.body.posts.length, 5);
    assert.equal(second.body.hasMore, false);
    assert.equal(second.body.total, 25);
  });

  it('feed=following requires authentication', async () => {
    const res = await supertest(app).get('/api/posts?feed=following');

    assert.equal(res.status, 401);
  });

  it('feed=following returns only followed users and self', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const carol = await createUser(app, { username: 'carol', email: 'c@example.com' });

    await createPost(app, alice.auth, 'Alice post');
    await createPost(app, bob.auth, 'Bob post');
    await createPost(app, carol.auth, 'Carol post');

    // Alice follows Bob only.
    await supertest(app).post(`/api/users/${bob.user.id}/follow`).set(alice.auth);

    const res = await supertest(app).get('/api/posts?feed=following').set(alice.auth);

    assert.equal(res.status, 200);
    const contents = res.body.posts.map((p) => p.content).sort();
    assert.deepEqual(contents, ['Alice post', 'Bob post']);
  });
});

describe('GET /api/posts/:id', () => {
  it('returns a post with comments', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Detailed post');
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'Nice' });

    const res = await supertest(app).get(`/api/posts/${post.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.post.content, 'Detailed post');
    assert.equal(res.body.comments.length, 1);
    assert.equal(res.body.comments[0].content, 'Nice');
  });

  it('returns 404 for a nonexistent post', async () => {
    const res = await supertest(app).get('/api/posts/507f1f77bcf86cd799439011');

    assert.equal(res.status, 404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await supertest(app).get('/api/posts/garbage');

    assert.equal(res.status, 400);
  });
});

describe('PATCH /api/posts/:id', () => {
  it('lets the author edit their own post', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Original');

    const res = await supertest(app)
      .patch(`/api/posts/${post.id}`)
      .set(auth)
      .send({ content: 'Edited' });

    assert.equal(res.status, 200);
    assert.equal(res.body.post.content, 'Edited');
  });

  it('blocks editing someone else\'s post with 403', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Alice post');

    const res = await supertest(app)
      .patch(`/api/posts/${post.id}`)
      .set(bob.auth)
      .send({ content: 'Hijacked' });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /only edit your own/i);
  });

  it('rejects editing to empty content', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Original');

    const res = await supertest(app)
      .patch(`/api/posts/${post.id}`)
      .set(auth)
      .send({ content: '  ' });

    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/posts/:id', () => {
  it('lets the author delete their post', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Doomed');

    const res = await supertest(app).delete(`/api/posts/${post.id}`).set(auth);

    assert.equal(res.status, 200);

    const check = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(check.status, 404);
  });

  it('blocks deleting someone else\'s post with 403', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Alice post');

    const res = await supertest(app).delete(`/api/posts/${post.id}`).set(bob.auth);

    assert.equal(res.status, 403);
  });

  it('cascades: deletes the post\'s comments too', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post with comments');
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'C1' });
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'C2' });

    await supertest(app).delete(`/api/posts/${post.id}`).set(auth);

    const res = await supertest(app).get(`/api/posts/${post.id}/comments`);
    // Post is gone, but the comments query should also be empty.
    assert.equal(res.body.comments.length, 0);
  });
});

describe('POST /api/posts/:id/like', () => {
  it('likes a post and reflects the count', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Like me');

    const res = await supertest(app).post(`/api/posts/${post.id}/like`).set(bob.auth);

    assert.equal(res.status, 200);
    assert.equal(res.body.liked, true);
    assert.equal(res.body.likeCount, 1);
  });

  it('unlikes on second call (toggle)', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Toggle me');

    await supertest(app).post(`/api/posts/${post.id}/like`).set(bob.auth);
    const res = await supertest(app).post(`/api/posts/${post.id}/like`).set(bob.auth);

    assert.equal(res.body.liked, false);
    assert.equal(res.body.likeCount, 0);
  });

  it('never double-counts the same user', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    await supertest(app).post(`/api/posts/${post.id}/like`).set(auth);
    await supertest(app).post(`/api/posts/${post.id}/like`).set(auth);
    await supertest(app).post(`/api/posts/${post.id}/like`).set(auth);

    const res = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(res.body.post.likeCount, 1);
  });

  it('counts likes from multiple users', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const carol = await createUser(app, { username: 'carol', email: 'c@example.com' });
    const post = await createPost(app, alice.auth, 'Popular');

    await supertest(app).post(`/api/posts/${post.id}/like`).set(bob.auth);
    await supertest(app).post(`/api/posts/${post.id}/like`).set(carol.auth);

    const res = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(res.body.post.likeCount, 2);
  });

  it('marks likedByViewer per viewer, not globally', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Post');

    await supertest(app).post(`/api/posts/${post.id}/like`).set(bob.auth);

    const asBob = await supertest(app).get(`/api/posts/${post.id}`).set(bob.auth);
    const asAlice = await supertest(app).get(`/api/posts/${post.id}`).set(alice.auth);

    assert.equal(asBob.body.post.likedByViewer, true);
    assert.equal(asAlice.body.post.likedByViewer, false);
  });

  it('requires authentication', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app).post(`/api/posts/${post.id}/like`);

    assert.equal(res.status, 401);
  });

  it('returns 404 for a nonexistent post', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts/507f1f77bcf86cd799439011/like')
      .set(auth);

    assert.equal(res.status, 404);
  });
});
