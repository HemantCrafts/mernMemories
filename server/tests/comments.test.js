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

describe('POST /api/posts/:id/comments', () => {
  it('adds a comment and increments commentCount', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(auth)
      .send({ content: 'Great post' });

    assert.equal(res.status, 201);
    assert.equal(res.body.comment.content, 'Great post');
    assert.equal(res.body.comment.isOwnComment, true);
    assert.equal(res.body.commentCount, 1);

    const check = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(check.body.post.commentCount, 1);
  });

  it('requires authentication', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .send({ content: 'Anonymous' });

    assert.equal(res.status, 401);
  });

  it('rejects empty content', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(auth)
      .send({ content: '   ' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /cannot be empty/i);
  });

  it('rejects content over 500 characters', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(auth)
      .send({ content: 'x'.repeat(501) });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Validation failed');
  });

  it('returns 404 for a nonexistent post', async () => {
    const { auth } = await createUser(app);

    const res = await supertest(app)
      .post('/api/posts/507f1f77bcf86cd799439011/comments')
      .set(auth)
      .send({ content: 'Ghost post' });

    assert.equal(res.status, 404);
  });

  it('accumulates commentCount across multiple comments', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Post');

    await supertest(app).post(`/api/posts/${post.id}/comments`).set(alice.auth).send({ content: 'One' });
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(bob.auth).send({ content: 'Two' });
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(bob.auth).send({ content: 'Three' });

    const res = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(res.body.post.commentCount, 3);
    assert.equal(res.body.comments.length, 3);
  });
});

describe('GET /api/posts/:id/comments', () => {
  it('returns comments oldest first', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'First' });
    await new Promise((r) => setTimeout(r, 12));
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'Second' });

    const res = await supertest(app).get(`/api/posts/${post.id}/comments`);

    assert.equal(res.status, 200);
    assert.equal(res.body.comments[0].content, 'First');
    assert.equal(res.body.comments[1].content, 'Second');
  });

  it('works without authentication', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');
    await supertest(app).post(`/api/posts/${post.id}/comments`).set(auth).send({ content: 'Visible' });

    const res = await supertest(app).get(`/api/posts/${post.id}/comments`);

    assert.equal(res.status, 200);
    assert.equal(res.body.comments.length, 1);
  });
});

describe('DELETE /api/posts/:postId/comments/:commentId', () => {
  it('lets the comment author delete their own comment', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Post');

    const created = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(bob.auth)
      .send({ content: 'Bob comment' });

    const res = await supertest(app)
      .delete(`/api/posts/${post.id}/comments/${created.body.comment.id}`)
      .set(bob.auth);

    assert.equal(res.status, 200);

    const check = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(check.body.comments.length, 0);
    assert.equal(check.body.post.commentCount, 0);
  });

  it('lets the post author moderate (delete) a comment from someone else', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const post = await createPost(app, alice.auth, 'Alice post');

    const created = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(bob.auth)
      .send({ content: 'Bob comment' });

    const res = await supertest(app)
      .delete(`/api/posts/${post.id}/comments/${created.body.comment.id}`)
      .set(alice.auth);

    assert.equal(res.status, 200);
  });

  it('blocks an unrelated third party with 403', async () => {
    const alice = await createUser(app, { username: 'alice', email: 'a@example.com' });
    const bob = await createUser(app, { username: 'bob', email: 'b@example.com' });
    const carol = await createUser(app, { username: 'carol', email: 'c@example.com' });
    const post = await createPost(app, alice.auth, 'Post');

    const created = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(bob.auth)
      .send({ content: 'Bob comment' });

    const res = await supertest(app)
      .delete(`/api/posts/${post.id}/comments/${created.body.comment.id}`)
      .set(carol.auth);

    assert.equal(res.status, 403);
  });

  it('decrements commentCount but never below zero', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const created = await supertest(app)
      .post(`/api/posts/${post.id}/comments`)
      .set(auth)
      .send({ content: 'Comment' });

    await supertest(app)
      .delete(`/api/posts/${post.id}/comments/${created.body.comment.id}`)
      .set(auth);

    // Delete the same comment again - already gone.
    const second = await supertest(app)
      .delete(`/api/posts/${post.id}/comments/${created.body.comment.id}`)
      .set(auth);

    assert.equal(second.status, 404);

    const check = await supertest(app).get(`/api/posts/${post.id}`);
    assert.equal(check.body.post.commentCount, 0);
  });

  it('returns 404 for a nonexistent comment', async () => {
    const { auth } = await createUser(app);
    const post = await createPost(app, auth, 'Post');

    const res = await supertest(app)
      .delete(`/api/posts/${post.id}/comments/507f1f77bcf86cd799439011`)
      .set(auth);

    assert.equal(res.status, 404);
  });
});
