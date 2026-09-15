/**
 * Orphaned-upload cleanup tests.
 *
 * This module DELETES files, so the tests here are weighted toward safety:
 * proving that referenced files are never removed, that dry-run removes
 * nothing, and that the grace period protects in-flight uploads. A bug here
 * destroys user data, and it's irreversible.
 */
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  startTestDatabase,
  stopTestDatabase,
  clearDatabase,
  makeApp,
  createUser,
} from './setup.js';
import {
  findOrphanedUploads,
  cleanupOrphanedUploads,
  collectReferencedImages,
  listStoredFiles,
  releaseImageIfUnreferenced,
  DEFAULT_GRACE_PERIOD_MS,
} from '../src/services/cleanupService.js';
import Post from '../src/models/Post.js';
import User from '../src/models/User.js';

const app = makeApp();

let uploadDir;

before(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mern-memories-cleanup-'));
  await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearDatabase();
  // Empty the upload dir between tests.
  const entries = await fs.readdir(uploadDir).catch(() => []);
  await Promise.all(
    entries.map((f) => fs.unlink(path.join(uploadDir, f)).catch(() => {}))
  );
});

/** Writes a fake image file with a controllable mtime. */
async function writeFile(name, { size = 100, ageMs = 2 * 60 * 60 * 1000 } = {}) {
  const full = path.join(uploadDir, name);
  await fs.writeFile(full, Buffer.alloc(size, 1));

  // Backdate so the grace period doesn't hide it.
  const when = new Date(Date.now() - ageMs);
  await fs.utimes(full, when, when);

  return full;
}

async function exists(name) {
  return fs
    .access(path.join(uploadDir, name))
    .then(() => true)
    .catch(() => false);
}

describe('collectReferencedImages', () => {
  it('returns nothing when there are no posts or avatars', async () => {
    const referenced = await collectReferencedImages();
    assert.equal(referenced.size, 0);
  });

  it('collects post image references', async () => {
    await Post.create({
      author: '507f1f77bcf86cd799439011',
      content: 'x',
      imageUrl: '/uploads/abc123.jpg',
    });

    const referenced = await collectReferencedImages();
    assert.ok(referenced.has('abc123.jpg'));
  });

  it('collects avatar references', async () => {
    await User.create({
      username: 'alice',
      email: 'a@example.com',
      password: 'Password123!',
      avatarUrl: '/uploads/avatar99.png',
    });

    const referenced = await collectReferencedImages();
    assert.ok(referenced.has('avatar99.png'));
  });

  it('ignores empty strings and missing fields', async () => {
    await Post.create({ author: '507f1f77bcf86cd799439011', content: 'no image', imageUrl: '' });

    const referenced = await collectReferencedImages();
    assert.equal(referenced.size, 0, 'empty imageUrl must not count as a reference');
  });
});

describe('listStoredFiles', () => {
  it('lists regular files and skips dotfiles', async () => {
    await writeFile('one.jpg');
    await writeFile('two.png');
    await fs.writeFile(path.join(uploadDir, '.gitkeep'), '');

    const files = await listStoredFiles(uploadDir);
    const names = files.map((f) => f.name).sort();

    assert.deepEqual(names, ['one.jpg', 'two.png']);
  });

  it('returns an empty list for a missing directory', async () => {
    const files = await listStoredFiles(path.join(uploadDir, 'does-not-exist'));
    assert.deepEqual(files, []);
  });
});

describe('findOrphanedUploads', () => {
  it('treats an unreferenced old file as an orphan', async () => {
    await writeFile('orphan.jpg');

    const result = await findOrphanedUploads(uploadDir);

    assert.equal(result.orphans.length, 1);
    assert.equal(result.orphans[0].name, 'orphan.jpg');
  });

  it('NEVER reports a referenced file as an orphan', async () => {
    await writeFile('keep.jpg');
    await Post.create({
      author: '507f1f77bcf86cd799439011',
      content: 'x',
      imageUrl: '/uploads/keep.jpg',
    });

    const result = await findOrphanedUploads(uploadDir);

    assert.equal(result.orphans.length, 0, 'referenced file must not be an orphan');
    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].name, 'keep.jpg');
  });

  it('NEVER reports a referenced avatar as an orphan', async () => {
    await writeFile('myavatar.png');
    await User.create({
      username: 'bob',
      email: 'b@example.com',
      password: 'Password123!',
      avatarUrl: '/uploads/myavatar.png',
    });

    const result = await findOrphanedUploads(uploadDir);

    assert.equal(result.orphans.length, 0);
    assert.equal(result.kept.length, 1);
  });

  it('protects a recent file even when unreferenced (in-flight upload)', async () => {
    // 30 seconds old - well inside the 1 hour default grace period.
    await writeFile('just-uploaded.jpg', { ageMs: 30 * 1000 });

    const result = await findOrphanedUploads(uploadDir);

    assert.equal(result.orphans.length, 0, 'recent file must be protected');
    assert.equal(result.skippedRecent.length, 1);
    assert.equal(result.skippedRecent[0].name, 'just-uploaded.jpg');
  });

  it('honours a custom grace period', async () => {
    await writeFile('recent.jpg', { ageMs: 5 * 60 * 1000 }); // 5 minutes old

    const strict = await findOrphanedUploads(uploadDir, { gracePeriodMs: 60 * 1000 });
    const lenient = await findOrphanedUploads(uploadDir, { gracePeriodMs: 60 * 60 * 1000 });

    assert.equal(strict.orphans.length, 1, 'with a 1 min grace it should be collectable');
    assert.equal(lenient.orphans.length, 0, 'with a 60 min grace it should be protected');
  });

  it('separates orphans, kept and recent files correctly', async () => {
    await writeFile('orphan.jpg');
    await writeFile('recent.jpg', { ageMs: 10 * 1000 });
    await writeFile('referenced.jpg');

    await Post.create({
      author: '507f1f77bcf86cd799439011',
      content: 'x',
      imageUrl: '/uploads/referenced.jpg',
    });

    const result = await findOrphanedUploads(uploadDir);

    assert.deepEqual(result.orphans.map((f) => f.name), ['orphan.jpg']);
    assert.deepEqual(result.kept.map((f) => f.name), ['referenced.jpg']);
    assert.deepEqual(result.skippedRecent.map((f) => f.name), ['recent.jpg']);
  });

  it('reports the total reclaimable size', async () => {
    await writeFile('a.jpg', { size: 1000 });
    await writeFile('b.jpg', { size: 2000 });

    const result = await findOrphanedUploads(uploadDir);

    assert.equal(result.totalBytes, 3000);
  });
});

describe('cleanupOrphanedUploads — dry run safety', () => {
  it('is a dry run by default and deletes NOTHING', async () => {
    await writeFile('orphan.jpg');

    const summary = await cleanupOrphanedUploads(uploadDir);

    assert.equal(summary.dryRun, true);
    assert.equal(summary.deleted.length, 1, 'should report what it would delete');
    assert.equal(await exists('orphan.jpg'), true, 'file must still exist after a dry run');
  });

  it('reports the same list in dry run as apply would delete', async () => {
    await writeFile('orphan1.jpg');
    await writeFile('orphan2.jpg');

    const preview = await cleanupOrphanedUploads(uploadDir, { apply: false });
    const previewNames = preview.deleted.map((f) => f.name).sort();

    const applied = await cleanupOrphanedUploads(uploadDir, { apply: true });
    const appliedNames = applied.deleted.map((f) => f.name).sort();

    assert.deepEqual(previewNames, appliedNames, 'dry run must predict accurately');
  });
});

describe('cleanupOrphanedUploads — apply', () => {
  it('deletes orphans when apply is true', async () => {
    await writeFile('orphan.jpg');

    const summary = await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(summary.dryRun, false);
    assert.equal(summary.deleted.length, 1);
    assert.equal(await exists('orphan.jpg'), false, 'orphan should be gone');
  });

  it('still refuses to delete referenced files', async () => {
    await writeFile('referenced.jpg');
    await writeFile('orphan.jpg');

    await Post.create({
      author: '507f1f77bcf86cd799439011',
      content: 'x',
      imageUrl: '/uploads/referenced.jpg',
    });

    await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(await exists('referenced.jpg'), true, 'referenced file must survive');
    assert.equal(await exists('orphan.jpg'), false);
  });

  it('still refuses to delete recent files', async () => {
    await writeFile('recent.jpg', { ageMs: 1000 });

    await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(await exists('recent.jpg'), true, 'recent file must survive');
  });

  it('leaves .gitkeep alone', async () => {
    await fs.writeFile(path.join(uploadDir, '.gitkeep'), '');

    await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(await exists('.gitkeep'), true);
  });

  it('handles an empty directory without error', async () => {
    const summary = await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(summary.deleted.length, 0);
    assert.equal(summary.failed.length, 0);
  });

  it('is idempotent - a second run finds nothing', async () => {
    await writeFile('orphan.jpg');

    await cleanupOrphanedUploads(uploadDir, { apply: true });
    const second = await cleanupOrphanedUploads(uploadDir, { apply: true });

    assert.equal(second.deleted.length, 0);
  });
});

describe('releaseImageIfUnreferenced', () => {
  it('removes the file once no post references it', async () => {
    await writeFile('gone.jpg');

    const removed = await releaseImageIfUnreferenced('/uploads/gone.jpg', uploadDir);

    assert.equal(removed, true);
    assert.equal(await exists('gone.jpg'), false);
  });

  it('REFUSES to remove a file that another post still uses', async () => {
    await writeFile('shared.jpg');

    // Two posts sharing the same upload (a user reusing an image).
    await Post.create({
      author: '507f1f77bcf86cd799439011',
      content: 'first',
      imageUrl: '/uploads/shared.jpg',
    });

    const removed = await releaseImageIfUnreferenced('/uploads/shared.jpg', uploadDir);

    assert.equal(removed, false, 'must not delete a file another post references');
    assert.equal(await exists('shared.jpg'), true);
  });

  it('REFUSES to remove a file used as an avatar', async () => {
    await writeFile('avatar.png');
    await User.create({
      username: 'carol',
      email: 'c@example.com',
      password: 'Password123!',
      avatarUrl: '/uploads/avatar.png',
    });

    const removed = await releaseImageIfUnreferenced('/uploads/avatar.png', uploadDir);

    assert.equal(removed, false);
    assert.equal(await exists('avatar.png'), true);
  });

  it('returns false for empty or missing input without throwing', async () => {
    assert.equal(await releaseImageIfUnreferenced('', uploadDir), false);
    assert.equal(await releaseImageIfUnreferenced(null, uploadDir), false);
    assert.equal(await releaseImageIfUnreferenced(undefined, uploadDir), false);
  });

  it('ignores a URL that is not under /uploads/ (cannot escape the directory)', async () => {
    const outside = path.join(os.tmpdir(), 'mern-memories-must-not-delete.txt');
    await fs.writeFile(outside, 'important');

    const removed = await releaseImageIfUnreferenced(
      `/uploads/../../${path.basename(outside)}`,
      uploadDir
    );

    assert.equal(removed, false);
    assert.equal(
      await fs.access(outside).then(() => true).catch(() => false),
      true,
      'file outside the upload dir must be untouched'
    );

    await fs.unlink(outside).catch(() => {});
  });
});

describe('post deletion releases its image', () => {
  it('deletes the image when the post is deleted', async () => {
    const { auth } = await createUser(app);

    // Generate a real PNG with sharp. A hand-written base64 fixture is easy
    // to get subtly wrong, and sharp correctly rejects a malformed one.
    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    const { createApp } = await import('../src/app.js');
    const supertest = (await import('supertest')).default;
    const appWithDir = createApp({ uploadDir });

    const uploaded = await supertest(appWithDir)
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'p.png');

    assert.equal(uploaded.status, 201);
    const filename = path.basename(uploaded.body.url);
    assert.equal(await exists(filename), true, 'uploaded file should exist');

    // Create a post referencing it.
    const post = await supertest(appWithDir)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'with image', imageUrl: uploaded.body.url });

    assert.equal(post.status, 201);

    // Delete the post. Cleanup is fire-and-forget, so give it a moment.
    const del = await supertest(appWithDir).delete(`/api/posts/${post.body.post.id}`).set(auth);
    assert.equal(del.status, 200);

    await new Promise((r) => setTimeout(r, 400));

    assert.equal(
      await exists(filename),
      false,
      'image should be released when its post is deleted'
    );
  });

  it('keeps the image if another post still references it', async () => {
    const { auth } = await createUser(app);

    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 5, g: 6, b: 7 } },
    })
      .png()
      .toBuffer();

    const { createApp } = await import('../src/app.js');
    const supertest = (await import('supertest')).default;
    const appWithDir = createApp({ uploadDir });

    const uploaded = await supertest(appWithDir)
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'shared.png');

    const filename = path.basename(uploaded.body.url);

    // Two posts sharing one upload.
    const first = await supertest(appWithDir)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'first', imageUrl: uploaded.body.url });

    await supertest(appWithDir)
      .post('/api/posts')
      .set(auth)
      .send({ content: 'second', imageUrl: uploaded.body.url });

    // Delete only the first.
    await supertest(appWithDir).delete(`/api/posts/${first.body.post.id}`).set(auth);
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(
      await exists(filename),
      true,
      'image must survive while a second post still references it'
    );
  });
});

describe('grace period default', () => {
  it('is one hour', () => {
    assert.equal(DEFAULT_GRACE_PERIOD_MS, 60 * 60 * 1000);
  });
});
