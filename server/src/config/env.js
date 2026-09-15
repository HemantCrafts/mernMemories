/**
 * Loads environment variables and validates that the critical ones exist.
 * Fails fast with a readable message instead of a cryptic runtime crash.
 *
 * IMPORTANT: `.env` is only read outside production. On a hosting platform the
 * dashboard's environment variables are the source of truth, and a `.env` file
 * that happens to be deployed (or left over from local dev) must never quietly
 * override them - a stale CLIENT_ORIGIN pointing at localhost would break CORS
 * on the live site, and a stale JWT_SECRET would be a security hole.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

if (!isProduction) {
  dotenv.config();
}

const required = ['MONGODB_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error('\n[config] Missing required environment variables:', missing.join(', '));
  console.error('[config] Create server/.env from server/.env.example and fill it in.');
  console.error('[config] On a hosting platform, set these in its dashboard instead.\n');
  process.exit(1);
}

if (process.env.MONGODB_URI.includes('<username>')) {
  console.error('\n[config] MONGODB_URI still contains the placeholder <username>.');
  console.error('[config] Paste your real MongoDB Atlas connection string into server/.env\n');
  process.exit(1);
}

/**
 * In production, a weak or default secret is a real vulnerability: anyone who
 * knows it can forge a valid JWT for any user. Refuse to boot rather than run
 * insecurely. This catches the common "forgot to set JWT_SECRET on the host"
 * mistake, which otherwise fails silently and unsafely.
 */
if (isProduction) {
  const secret = process.env.JWT_SECRET;
  const isPlaceholder =
    /change_this|replace_me|placeholder|your_?secret/i.test(secret) ||
    secret.length < 32;

  if (isPlaceholder) {
    console.error('\n[config] JWT_SECRET is too weak for production.');
    console.error('[config] Use at least 32 random characters. Generate one with:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
  }
}

/** Absolute path to the uploads directory (server/uploads by default). */
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

// Comma-separated list of origins allowed to call the API.
//
// The default differs by environment on purpose. In development the loopback
// spellings are correct; in production they are useless because the browser
// sends the real hostname as Origin, so an unset CLIENT_ORIGIN would silently
// reject every request from the deployed UI.
//
// We do not guess the production origin: guessing wrong still breaks, and it
// hides a misconfiguration. An empty list forces a loud failure instead - see
// the check in app.js.
const clientOrigins = (
  process.env.CLIENT_ORIGIN || (isProduction ? '' : 'http://localhost:5173,http://127.0.0.1:5173')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && clientOrigins.length === 0) {
  console.error('\n[config] CLIENT_ORIGIN must be set in production.');
  console.error('[config] Set it to your public URL, e.g. https://mern-memories.onrender.com');
  console.error('[config] Comma-separate multiple origins. CORS rejects anything not listed.\n');
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins,
  uploadDir,
  /** Hard cap on a single uploaded file, enforced by multer. */
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024, // 5 MB
};

export { isProduction };
