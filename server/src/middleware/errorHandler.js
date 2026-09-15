import { ApiError } from '../utils/ApiError.js';

/** 404 fallback for unmatched routes. */
export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Wraps async handlers so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Terminal error handler. Translates Mongoose and JWT errors into
 * consistent { message } responses the client can render directly.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _req, res, _next) {
  let status = error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let details;

  // Mongoose: schema validation failure
  if (error.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Mongoose: bad ObjectId cast
  if (error.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${error.path}`;
  }

  // Mongo: unique index violation
  if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    message = `That ${field} is already taken`;
    details = [{ field, message }];
  }

  if (status >= 500) {
    console.error('[error]', error);
  }

  res.status(status).json({
    message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV === 'development' && status >= 500
      ? { stack: error.stack }
      : {}),
  });
}
