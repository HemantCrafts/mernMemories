/**
 * Image upload processing.
 *
 * Security model — every step assumes the uploaded bytes are hostile:
 *
 *   1. Size is capped before anything touches memory (by multer, upstream).
 *   2. The declared mimetype is IGNORED. It's attacker-controlled. We inspect
 *      the file's magic bytes instead to determine the real format.
 *   3. The file is decoded and RE-ENCODED through sharp. This is the critical
 *      step: it discards all metadata (EXIF/GPS), and the output is a fresh
 *      image buffer built pixel-by-pixel. A polyglot file (valid JPEG *and*
 *      valid HTML/JS) cannot survive re-encoding, because the original bytes
 *      are never copied through.
 *   4. The filename is generated server-side from a CSPRNG. The client's
 *      filename is never used, so path traversal (`../../etc/passwd`) is
 *      structurally impossible rather than merely filtered.
 *   5. Output is constrained to a maximum dimension and re-encoded as
 *      progressive JPEG/PNG/WebP only.
 *
 * The result: a stored file is always a genuine image, written to a path we
 * chose, with no attacker-controlled bytes carried over.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ApiError } from '../utils/ApiError.js';

/** Formats we're willing to accept, keyed by the magic bytes that identify them. */
const SIGNATURES = [
  {
    format: 'jpeg',
    // FF D8 FF
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    format: 'png',
    // 89 50 4E 47 0D 0A 1A 0A
    test: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    format: 'webp',
    // "RIFF" .... "WEBP"
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    format: 'gif',
    // "GIF87a" or "GIF89a"
    test: (b) =>
      b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a',
  },
];

const MAX_DIMENSION = 1600;
const OUTPUT_QUALITY = 82;

/**
 * Identifies the real format from the leading bytes.
 * Returns null for anything unrecognised.
 */
export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  for (const signature of SIGNATURES) {
    if (signature.test(buffer)) return signature.format;
  }

  return null;
}

/**
 * Processes an uploaded image buffer and writes it to disk.
 *
 * @param {Buffer} buffer      Raw bytes from the multipart upload.
 * @param {string} uploadDir   Absolute directory to write into.
 * @returns {Promise<{ url: string, filename: string, size: number, format: string, width: number, height: number }>}
 */
export async function processAndStoreImage(buffer, uploadDir) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, 'No image data received');
  }

  // --- 1. Verify the real format from magic bytes -------------------------
  const detected = detectImageFormat(buffer);

  if (!detected) {
    throw new ApiError(
      400,
      'Unsupported file type. Please upload a JPEG, PNG, WebP or GIF image.'
    );
  }

  // --- 2. Re-encode through sharp ----------------------------------------
  // `animated: true` keeps GIFs from collapsing to a single frame.
  let pipeline = sharp(buffer, { animated: detected === 'gif', failOn: 'error' });

  // Read metadata before resizing so we can report original dimensions and
  // reject images that are absurdly large even if compressed.
  const metadata = await pipeline.metadata().catch(() => {
    throw new ApiError(400, 'That file could not be read as an image');
  });

  const MAX_PIXELS = 50_000_000; // 50 MP - blocks decompression bombs
  if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_PIXELS) {
    throw new ApiError(400, 'Image resolution is too large (max 50 megapixels)');
  }

  // Rebuild the pipeline to reset it after metadata().
  pipeline = sharp(buffer, { animated: detected === 'gif', failOn: 'error' });

  // `withoutEnlargement` avoids upscaling small images to the cap.
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Strip all metadata (EXIF/GPS/ICC) and re-encode.
  // `.rotate()` with no args auto-orients using EXIF before it's discarded,
  // so photos don't end up sideways once the orientation tag is gone.
  pipeline = pipeline.rotate();

  let output;
  let extension;

  if (detected === 'gif') {
    output = await pipeline.gif().toBuffer();
    extension = 'gif';
  } else if (detected === 'png') {
    output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    extension = 'png';
  } else if (detected === 'webp') {
    output = await pipeline.webp({ quality: OUTPUT_QUALITY }).toBuffer();
    extension = 'webp';
  } else {
    output = await pipeline.jpeg({ quality: OUTPUT_QUALITY, progressive: true }).toBuffer();
    extension = 'jpg';
  }

  // --- 3. Server-generated filename --------------------------------------
  // 16 random bytes = 128 bits. Collisions are not a practical concern.
  const filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${extension}`;

  await fs.mkdir(uploadDir, { recursive: true });

  // Resolve and confirm the final path stays inside uploadDir. This is
  // belt-and-braces: the filename is already generated, never user-supplied,
  // but an explicit containment check means a future refactor can't
  // silently reintroduce traversal.
  const destination = path.resolve(uploadDir, filename);

  if (!destination.startsWith(path.resolve(uploadDir) + path.sep)) {
    throw new ApiError(500, 'Refusing to write outside the upload directory');
  }

  await fs.writeFile(destination, output, { mode: 0o644, flag: 'wx' });

  // Re-read dimensions from the stored output so the client gets the truth.
  const finalMeta = await sharp(output).metadata();

  return {
    url: `/uploads/${filename}`,
    filename,
    size: output.length,
    format: extension,
    width: finalMeta.width ?? null,
    height: finalMeta.height ?? null,
  };
}

/** Removes a previously stored upload. Best-effort - never throws. */
export async function deleteStoredImage(url, uploadDir) {
  if (!url || !url.startsWith('/uploads/')) return false;

  // Take only the basename so a crafted URL can't escape the directory.
  const filename = path.basename(url);
  const target = path.resolve(uploadDir, filename);

  if (!target.startsWith(path.resolve(uploadDir) + path.sep)) return false;

  try {
    await fs.unlink(target);
    return true;
  } catch {
    return false;
  }
}

export const uploadConfig = { MAX_DIMENSION, OUTPUT_QUALITY };
