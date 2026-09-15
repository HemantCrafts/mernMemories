import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { processAndStoreImage } from '../services/imageService.js';

/**
 * Files are held in MEMORY, not written straight to disk.
 * That's deliberate: the bytes must be validated and re-encoded before they
 * ever touch the filesystem, so a malicious file never lands as-is.
 *
 * The size cap is enforced here, which also protects the re-encoding step
 * from being handed something huge.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
    fields: 5,
  },
});

/** Uploads are expensive (decode + re-encode), so throttle them. */
const uploadLimiter =
  config.nodeEnv === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many uploads. Please try again shortly.' },
      });

/**
 * Builds the uploads router.
 *
 * @param {object} [options]
 * @param {string} [options.uploadDir]  Where to write processed images.
 *   Defaults to config.uploadDir. Injected so tests can use a temp directory
 *   and so the writer and the static handler can't disagree about location.
 */
export default function createUploadsRouter(options = {}) {
  const router = Router();
  const uploadDir = options.uploadDir ?? config.uploadDir;

  /**
   * POST /api/uploads
   * multipart/form-data with a single `image` field.
   * Requires authentication.
   */
  router.post(
    '/',
    requireAuth,
    uploadLimiter,
    (req, res, next) => {
      upload.single('image')(req, res, (error) => {
        if (!error) return next();

        // Translate multer's errors into our own shape.
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            const mb = Math.round(config.maxUploadBytes / (1024 * 1024));
            return next(
              new ApiError(413, `That image is too large. Maximum size is ${mb} MB.`)
            );
          }
          if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              new ApiError(
                400,
                `Unexpected field "${error.field}". Use the field name "image".`
              )
            );
          }
          return next(new ApiError(400, `Upload failed: ${error.message}`));
        }

        return next(error);
      });
    },
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ApiError(400, 'No image was uploaded. Use the field name "image".');
      }

      // Note: req.file.mimetype is intentionally NOT used for validation.
      // It's supplied by the client and can claim anything. The service
      // inspects the actual bytes instead.
      const result = await processAndStoreImage(req.file.buffer, uploadDir);

      res.status(201).json({
        url: result.url,
        filename: result.filename,
        size: result.size,
        format: result.format,
        width: result.width,
        height: result.height,
      });
    })
  );

  return router;
}
