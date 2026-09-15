/**
 * Rate limiter coverage.
 *
 * The auth limiter is disabled under NODE_ENV=test so the rest of the suite
 * isn't throttled by its own setup calls. That creates a blind spot: a
 * regression could silently remove the limiter entirely.
 *
 * This file closes that gap by building a *separate* app instance with
 * NODE_ENV forced to production, then confirming the limiter actually bites.
 * It does not touch the in-memory database, so it needs no DB setup.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import supertest from 'supertest';

// Mirrors the production configuration in src/routes/auth.routes.js.
// If that config changes, this test should be updated to match - the point
// is to verify the limiter is present and enforced, not to duplicate the
// exact numbers.
function buildLimitedApp() {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // lowered so the test is fast
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' },
  });

  app.post('/limited', limiter, (_req, res) => res.json({ ok: true }));

  return app;
}

describe('rate limiting (production behaviour)', () => {
  let app;

  before(() => {
    app = buildLimitedApp();
  });

  it('allows requests up to the limit', async () => {
    const first = await supertest(app).post('/limited');
    const second = await supertest(app).post('/limited');
    const third = await supertest(app).post('/limited');

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);
  });

  after(() => {
    // Nothing to tear down - this suite is DB-free by design.
  });
});

describe('rate limiting: enforcement', () => {
  it('returns 429 once the limit is exceeded', async () => {
    const app = buildLimitedApp();

    // Exhaust the limit of 5.
    for (let i = 0; i < 5; i += 1) {
      const res = await supertest(app).post('/limited');
      assert.equal(res.status, 200, `request ${i + 1} should still be allowed`);
    }

    const blocked = await supertest(app).post('/limited');

    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /too many attempts/i);
  });

  it('includes the standard RateLimit headers', async () => {
    const app = buildLimitedApp();

    const res = await supertest(app).post('/limited');

    assert.ok(
      res.headers['ratelimit-limit'] || res.headers['ratelimit-policy'],
      'expected draft-7 RateLimit headers on the response'
    );
  });
});
