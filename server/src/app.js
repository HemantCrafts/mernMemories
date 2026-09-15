import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, isProduction } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import postRoutesFactory from './routes/posts.routes.js';
import userRoutes from './routes/users.routes.js';
import uploadRoutesFactory from './routes/uploads.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds the Express app.
 *
 * @param {object} [options]
 * @param {string} [options.uploadDir]  Directory to serve /uploads from.
 *   Defaults to config.uploadDir. Tests pass a temp directory so they never
 *   touch real user content - and so the static handler and the upload
 *   writer can't disagree about where files live.
 */
export function createApp(options = {}) {
  const app = express();
  const uploadDir = options.uploadDir ?? config.uploadDir;

  app.set('trust proxy', 1);

  // --- CORS ---------------------------------------------------------------
  // Applied to /api ONLY, deliberately.
  //
  // CORS is a browser rule about cross-origin *fetch* calls. Static assets and
  // the SPA shell are same-origin and never need it. Applying it globally
  // creates a nasty failure mode: Vite tags its bundles with `crossorigin`, so
  // the browser sends an Origin header for /assets/*.js. A CLIENT_ORIGIN typo
  // then returns 403 for the JavaScript, React never mounts, and the site is a
  // blank white page with no hint as to why. Scoping it here means a typo
  // surfaces as failing API calls - visible and debuggable - instead.
  //
  // Note: the callback is given an ApiError so a rejected origin produces a
  // clean 403 instead of a 500 with a stack trace. The browser blocks the
  // response either way - this just keeps the server logs and payload honest.
  const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/;

  app.use(
    '/api',
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // curl / Postman
        if (config.clientOrigins.includes(origin)) return callback(null, true);
        if (!isProduction && LOOPBACK_ORIGIN.test(origin)) {
          return callback(null, true);
        }
        return callback(new ApiError(403, `Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    })
  );

  // --- Parsing & logging --------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!isProduction) {
    app.use(morgan('dev'));
  }

  // --- Health check -------------------------------------------------------
  // Deliberately does NOT query MongoDB. Render polls this to decide whether
  // a deploy succeeded, and a slow or briefly-unreachable Atlas cluster would
  // otherwise fail an otherwise-healthy deploy. mongoose's readyState is a
  // local value, so reporting it costs nothing and makes debugging easier.
  const MONGOOSE_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: config.nodeEnv,
      uptime: Math.round(process.uptime()),
      database: MONGOOSE_STATES[mongoose.connection.readyState] || 'unknown',
      timestamp: new Date().toISOString(),
    });
  });

  // --- API routes ---------------------------------------------------------
  app.use('/api/auth', authRoutes);
  app.use(
    '/api/posts',
    postRoutesFactory({ uploadDir, awaitCleanup: config.nodeEnv === 'test' })
  );
  app.use('/api/users', userRoutes);
  app.use('/api/uploads', uploadRoutesFactory({ uploadDir }));

  // --- Serve uploaded images ----------------------------------------------
  // Defence in depth on top of the re-encoding step:
  //
  //   * `dotfiles: 'deny'`  - never serve dotfiles even if one appears.
  //   * `index: false`      - no directory listing.
  //   * `setHeaders`        - force a safe Content-Type, and add
  //                           X-Content-Type-Options: nosniff so a browser
  //                           can't be tricked into interpreting a file as
  //                           HTML/JS by sniffing its contents.
  //
  // Every stored file has already been re-encoded by sharp, so it *is* a real
  // image. These headers ensure that even in a future regression, the worst
  // case is a broken image rather than script execution.
  app.use(
    '/uploads',
    express.static(uploadDir, {
      dotfiles: 'deny',
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();

        const types = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
        };

        const contentType = types[ext];

        if (contentType) {
          res.setHeader('Content-Type', contentType);
        } else {
          // Unknown extension: force a download rather than inline render.
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', 'attachment');
        }

        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Uploaded content should never be treated as a document.
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
      },
    })
  );

  // --- Serve the built React app in production ----------------------------
  // In dev the client runs on Vite with a proxy, so this only matters
  // after `npm run build`.
  if (isProduction) {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // --- 404 + errors (must be last) ----------------------------------------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
