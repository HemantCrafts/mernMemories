/**
 * Upload security tests.
 *
 * These are the tests that matter most in this codebase: they assert the
 * upload path is hostile-input-safe, not merely that it works.
 *
 * Each test names the specific attack it prevents, so a regression tells you
 * which security property you just lost.
 */
import { before, after, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import supertest from 'supertest';
import sharp from 'sharp';
import {
  startTestDatabase,
  stopTestDatabase,
  clearDatabase,
  makeApp,
  createUser,
} from './setup.js';

const app = makeApp();

// Use a throwaway temp directory so tests never touch server/uploads.
let uploadDir;
let appWithTempUploads;

before(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mern-memories-uploads-'));
  // Build a dedicated app instance pointed at the temp dir. Both the upload
  // writer and the static handler receive it, so they can't disagree.
  appWithTempUploads = makeApp({ uploadDir });
  await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(clearDatabase);

// NOTE: deliberately no afterEach that wipes the upload dir. Node's test
// runner can interleave suite execution, and deleting files mid-file makes
// "the file exists on disk" assertions flaky. Each run uses a fresh temp dir
// and `after()` removes the whole thing.

/** All upload assertions go through the temp-dir app. */
const uploadApp = () => appWithTempUploads;

// --- Test fixtures --------------------------------------------------------

/** A genuine 4x4 PNG, produced by sharp. */
async function realPng() {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

/** A genuine JPEG. */
async function realJpeg() {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 40, g: 200, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

describe('POST /api/uploads — happy path', () => {
  it('accepts a real PNG and returns a usable path', async () => {
    const { auth } = await createUser(uploadApp());
    const png = await realPng();

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'photo.png');

    assert.equal(res.status, 201);
    assert.match(res.body.url, /^\/uploads\/[A-Za-z0-9_-]+\.png$/);
    assert.equal(res.body.format, 'png');
    assert.ok(res.body.size > 0);
    assert.equal(res.body.width, 4);
    assert.equal(res.body.height, 4);
  });

  it('accepts a real JPEG', async () => {
    const { auth } = await createUser(uploadApp());
    const jpeg = await realJpeg();

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', jpeg, 'photo.jpg');

    assert.equal(res.status, 201);
    assert.match(res.body.url, /\.jpg$/);
  });

  it('actually writes the file to disk', async () => {
    const { auth } = await createUser(uploadApp());
    const png = await realPng();

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'photo.png');

    const filename = res.body.url.replace('/uploads/', '');
    const onDisk = await fs.readFile(path.join(uploadDir, filename));

    assert.ok(onDisk.length > 0, 'expected the file to exist on disk');
  });

  it('serves the uploaded file back over HTTP as an image', async () => {
    const { auth } = await createUser(uploadApp());
    const png = await realPng();

    const uploaded = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'photo.png');

    const fetched = await supertest(uploadApp()).get(uploaded.body.url);

    assert.equal(fetched.status, 200);
    assert.match(fetched.headers['content-type'], /^image\/png/);
    assert.equal(fetched.headers['x-content-type-options'], 'nosniff');
  });

  it('requires authentication', async () => {
    const png = await realPng();

    const res = await supertest(uploadApp()).post('/api/uploads').attach('image', png, 'p.png');

    assert.equal(res.status, 401);
  });

  it('rejects a request with no file', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp()).post('/api/uploads').set(auth);

    assert.equal(res.status, 400);
    assert.match(res.body.message, /No image was uploaded/i);
  });
});

describe('POST /api/uploads — hostile input', () => {
  it('rejects a non-image file even when the mimetype is spoofed as image/png', async () => {
    const { auth } = await createUser(uploadApp());

    // A plain-text file that claims to be a PNG. Trusting the declared
    // mimetype would let this through; magic-byte inspection must not.
    const evil = Buffer.from('<html><script>alert(1)</script></html>');

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', evil, { filename: 'evil.png', contentType: 'image/png' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Unsupported file type/i);
  });

  it('rejects an SVG (XSS-capable, not a raster image)', async () => {
    const { auth } = await createUser(uploadApp());
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', svg, { filename: 'x.svg', contentType: 'image/svg+xml' });

    assert.equal(res.status, 400);
  });

  it('rejects an executable-ish payload with a JPEG header bolted on (polyglot)', async () => {
    const { auth } = await createUser(uploadApp());

    // Valid JPEG magic bytes followed by HTML. This is the classic polyglot:
    // it passes naive magic-byte checks but is not decodable as an image.
    // Sharp must fail on it, so it never reaches disk.
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const polyglot = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), html]);

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', polyglot, { filename: 'poly.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 400, 'polyglot file must be rejected, not stored');
  });

  it('rejects an empty buffer', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' });

    assert.equal(res.status, 400);
  });

  it('never uses the client-supplied filename (no path traversal)', async () => {
    const { auth } = await createUser(uploadApp());
    const png = await realPng();

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, '../../../evil.png');

    assert.equal(res.status, 201);

    // The stored name must be server-generated, not derived from the input.
    const filename = res.body.url.replace('/uploads/', '');
    assert.ok(!filename.includes('..'), 'filename must not contain traversal');
    assert.ok(!filename.includes('/'), 'filename must not contain a slash');
    assert.match(filename, /^\d+-[a-f0-9]{32}\.(png|jpg)$/);

    // And nothing may exist outside the upload dir.
    const escaped = path.resolve(uploadDir, '../../../evil.png');
    const exists = await fs.access(escaped).then(() => true).catch(() => false);
    assert.equal(exists, false, 'file must not have escaped the upload directory');
  });

  it('generates a unique filename per upload (no collisions / overwrites)', async () => {
    const { auth } = await createUser(uploadApp());
    const png = await realPng();

    const first = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'same.png');
    const second = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', png, 'same.png');

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.url, second.body.url, 'filenames must not collide');
  });
});

describe('POST /api/uploads — metadata stripping', () => {
  it('removes EXIF metadata from the stored image', async () => {
    const { auth } = await createUser(uploadApp());

    // Build a JPEG carrying EXIF, so we can prove it's gone afterwards.
    const withExif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .withExif({ IFD0: { Copyright: 'SECRET_COPYRIGHT_MARKER', Artist: 'SECRET_ARTIST' } })
      .jpeg()
      .toBuffer();

    // Sanity check: the fixture really does contain the marker.
    const beforeBytes = withExif.toString('latin1');
    assert.ok(
      beforeBytes.includes('SECRET_COPYRIGHT_MARKER'),
      'fixture should contain EXIF to make this test meaningful'
    );

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', withExif, { filename: 'exif.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 201);

    const filename = res.body.url.replace('/uploads/', '');
    const stored = await fs.readFile(path.join(uploadDir, filename));

    assert.ok(
      !stored.toString('latin1').includes('SECRET_COPYRIGHT_MARKER'),
      'EXIF copyright must be stripped from the stored file'
    );
    assert.ok(
      !stored.toString('latin1').includes('SECRET_ARTIST'),
      'EXIF artist must be stripped from the stored file'
    );
  });

  it('strips metadata so GPS coordinates do not leak', async () => {
    const { auth } = await createUser(uploadApp());

    const withGps = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .withExif({
        IFD0: { Copyright: 'GPS_MARKER_12345' },
      })
      .jpeg()
      .toBuffer();

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', withGps, { filename: 'gps.jpg', contentType: 'image/jpeg' });

    const filename = res.body.url.replace('/uploads/', '');
    const meta = await sharp(path.join(uploadDir, filename)).metadata();

    assert.equal(meta.exif, undefined, 'no EXIF block should survive processing');
  });
});

describe('POST /api/uploads — size limits', () => {
  it('rejects a file larger than MAX_UPLOAD_BYTES with 413', async () => {
    const { auth } = await createUser(uploadApp());

    // 6 MB of noise exceeds the 5 MB default cap.
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0);
    // Give it a PNG header so it fails on size, not on format.
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized);

    const res = await supertest(uploadApp())
      .post('/api/uploads')
      .set(auth)
      .attach('image', oversized, { filename: 'big.png', contentType: 'image/png' });

    assert.equal(res.status, 413);
    assert.match(res.body.message, /too large/i);
  });
});

describe('uploaded images cannot be used to inject markup', () => {
  it('rejects an imageUrl pointing outside /uploads/', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: 'https://evil.example.com/a.png' });

    assert.equal(res.status, 400);
  });

  it('rejects a protocol-relative imageUrl', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '//evil.example.com/a.png' });

    assert.equal(res.status, 400);
  });

  it('rejects a data: URI in imageUrl', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });

    assert.equal(res.status, 400);
  });

  it('rejects a javascript: URI in avatarUrl', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .patch('/api/users/me')
      .set(auth)
      .send({ avatarUrl: 'javascript:alert(1)' });

    assert.equal(res.status, 400);
  });

  it('rejects traversal in imageUrl', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '/uploads/../../../etc/passwd' });

    assert.equal(res.status, 400);
  });

  it('rejects a percent-encoded traversal in imageUrl', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd' });

    assert.equal(res.status, 400);
  });

  it('rejects a non-image extension under /uploads/', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '/uploads/malicious.html' });

    assert.equal(res.status, 400);
  });

  it('accepts a well-formed uploaded path', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '/uploads/1700000000000-abcdef0123456789.jpg' });

    assert.equal(res.status, 201);
    assert.equal(res.body.post.imageUrl, '/uploads/1700000000000-abcdef0123456789.jpg');
  });

  it('allows clearing an image with an empty string', async () => {
    const { auth } = await createUser(uploadApp());

    const res = await supertest(uploadApp())
      .post('/api/posts')
      .set(auth)
      .send({ content: 'x', imageUrl: '' });

    assert.equal(res.status, 201);
    assert.equal(res.body.post.imageUrl, '');
  });
});
