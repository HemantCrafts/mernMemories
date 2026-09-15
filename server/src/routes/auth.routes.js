import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/ApiError.js';

const router = Router();

/**
 * Slow down credential stuffing against these endpoints.
 *
 * Disabled under NODE_ENV=test, otherwise the suite would trip its own
 * limit after 20 auth requests and fail for the wrong reason. Rate limiting
 * itself is covered explicitly in tests/rate-limit.test.js.
 */
const authLimiter =
  config.nodeEnv === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many attempts. Please try again in a few minutes.' },
      });

function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function buildAuthResponse(user) {
  return {
    token: signToken(user),
    user: user.toPublicProfile(),
  };
}

/**
 * POST /api/auth/register
 * Creates an account and returns a token so the user is logged in immediately.
 */
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      throw new ApiError(400, 'Username, email and password are required');
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    }).select('email username');

    if (existing) {
      const field = existing.email === email.toLowerCase() ? 'email' : 'username';
      throw new ApiError(409, `That ${field} is already registered`);
    }

    const user = await User.create({
      username,
      email,
      password,
      displayName: displayName || username,
    });

    res.status(201).json(buildAuthResponse(user));
  })
);

/**
 * POST /api/auth/login
 * Accepts either a username or an email in the `identifier` field.
 */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, email, username, password } = req.body;
    const login = identifier || email || username;

    if (!login || !password) {
      throw new ApiError(400, 'Username/email and password are required');
    }

    const user = await User.findOne({
      $or: [{ email: String(login).toLowerCase() }, { username: login }],
    }).select('+password');

    // Same message for both failure modes so we don't leak which accounts exist.
    if (!user || !(await user.comparePassword(password))) {
      throw new ApiError(401, 'Invalid credentials');
    }

    res.json(buildAuthResponse(user));
  })
);

/**
 * GET /api/auth/me
 * Returns the current user. The client calls this on boot to restore a session.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toPublicProfile() });
  })
);

export default router;
