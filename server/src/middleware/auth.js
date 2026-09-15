import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Verifies the Bearer token and attaches the user to req.user.
 * Rejects if the token is missing, malformed, expired, or the user is gone.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }

    const token = header.slice(7).trim();

    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Session expired, please log in again');
      }
      throw new ApiError(401, 'Invalid or expired token');
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      throw new ApiError(401, 'The account for this token no longer exists');
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Optional auth: attaches req.user when a valid token is present,
 * but never blocks the request. Used on the public feed so it can
 * mark posts as liked for logged-in viewers.
 */
export async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) return next();

    const token = header.slice(7).trim();
    if (!token) return next();

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);

    if (user) req.user = user;
    return next();
  } catch {
    // A bad token on a public route is not an error - treat as anonymous.
    return next();
  }
}
