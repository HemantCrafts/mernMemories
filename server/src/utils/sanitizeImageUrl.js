import { ApiError } from './ApiError.js';

/**
 * Validates and normalizes an image reference supplied by a client.
 *
 * Only same-origin paths under /uploads/ are permitted, because the server
 * is the only entity that writes there. Rejected:
 *
 *   - absolute URLs (http/https) to any host, including our own
 *   - protocol-relative URLs (//evil.com/x.png)
 *   - data:, javascript:, vbscript: and blob: URIs
 *   - any path containing a traversal sequence
 *   - paths that aren't a single filename directly under /uploads/
 *   - extensions the image processor never produces
 *
 * An empty or absent value means "no image" and returns ''.
 *
 * @param {unknown} value
 * @param {string} fieldName  Used in the error message so the client knows which field failed.
 * @returns {string}
 */
export function sanitizeImageUrl(value, fieldName = 'imageUrl') {
  if (value === undefined || value === null) return '';

  const raw = String(value).trim();
  if (raw === '') return '';

  if (!raw.startsWith('/uploads/')) {
    throw new ApiError(
      400,
      `Invalid ${fieldName}. Only images uploaded through POST /api/uploads can be used.`
    );
  }

  // Reject traversal, including percent-encoded variants.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  if (decoded.includes('..') || decoded.includes('\\') || /%2e%2e/i.test(raw)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  const filename = raw.slice('/uploads/'.length);

  // Must be a bare filename - no further path segments.
  if (!filename || filename.includes('/')) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  // Defence in depth: allow only the extensions our processor writes.
  if (!/^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return `/uploads/${filename}`;
}
