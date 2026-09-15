/**
 * Orphaned upload cleanup.
 *
 * Two distinct sources of leaked files:
 *
 *   1. A post is deleted, but its image stays on disk forever.
 *   2. A user uploads an image and never attaches it to anything (abandons
 *      the composer, closes the tab). The file is written but never
 *      referenced by any document.
 *
 * (1) is handled immediately at delete time by `releaseImagesForPost`.
 * (2) needs a sweep, which is what this module does.
 *
 * ---------------------------------------------------------------------------
 * SAFETY MODEL
 *
 * A sweep deletes files. Getting that wrong destroys user data irreversibly,
 * so this module is built defensively:
 *
 *   • DRY RUN BY DEFAULT. `cleanupOrphanedUploads` reports what it *would*
 *     delete and deletes nothing unless `{ apply: true }` is passed.
 *
 *   • GRACE PERIOD. Files newer than `gracePeriodMs` are never touched. An
 *     upload in flight - written to disk but not yet referenced by a post
 *     that's still being created - is indistinguishable from an orphan at
 *     that instant. The grace period is what makes the sweep safe to run
 *     while the server is live.
 *
 *   • REFERENCE SCAN IS AUTHORITATIVE. A file is only orphaned if NO Post
 *     and NO User references it. Anything referenced is kept, always.
 *
 *   • FAIL-SAFE ON ERROR. If the database can't be read, the sweep aborts
 *     rather than assuming everything is unreferenced.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { deleteStoredImage } from './imageService.js';

/** Files younger than this are assumed to be in-flight and left alone. */
export const DEFAULT_GRACE_PERIOD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Collects every image path currently referenced by a document.
 *
 * Reads through a cursor-free `distinct` query for efficiency, and tolerates
 * empty strings and missing fields.
 */
export async function collectReferencedImages() {
  const [postImages, avatarImages] = await Promise.all([
    Post.distinct('imageUrl'),
    User.distinct('avatarUrl'),
  ]);

  const referenced = new Set();

  for (const value of [...postImages, ...avatarImages]) {
    if (typeof value === 'string' && value.trim() !== '') {
      // Store the basename so comparison is independent of the /uploads prefix.
      referenced.add(path.basename(value.trim()));
    }
  }

  return referenced;
}

/**
 * Lists files in the upload directory with their stats.
 * Ignores dotfiles such as .gitkeep.
 */
export async function listStoredFiles(uploadDir) {
  let entries;

  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(uploadDir, entry.name);
    const stats = await fs.stat(fullPath).catch(() => null);

    if (!stats) continue;

    files.push({
      name: entry.name,
      path: fullPath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    });
  }

  return files;
}

/**
 * Identifies orphaned uploads.
 *
 * @param {string} uploadDir
 * @param {object} [options]
 * @param {number} [options.gracePeriodMs]  Files newer than this are skipped.
 * @param {number} [options.now]            Injectable clock, for testing.
 * @returns {Promise<{ orphans: Array, kept: Array, skippedRecent: Array, totalBytes: number }>}
 */
export async function findOrphanedUploads(uploadDir, options = {}) {
  const { gracePeriodMs = DEFAULT_GRACE_PERIOD_MS, now = Date.now() } = options;

  const [referenced, files] = await Promise.all([
    collectReferencedImages(),
    listStoredFiles(uploadDir),
  ]);

  const orphans = [];
  const kept = [];
  const skippedRecent = [];

  for (const file of files) {
    if (referenced.has(file.name)) {
      kept.push(file);
      continue;
    }

    // Unreferenced. But is it old enough to be safely considered abandoned?
    if (now - file.mtimeMs < gracePeriodMs) {
      skippedRecent.push(file);
      continue;
    }

    orphans.push(file);
  }

  return {
    orphans,
    kept,
    skippedRecent,
    totalBytes: orphans.reduce((sum, file) => sum + file.size, 0),
    scannedAt: new Date(now).toISOString(),
    gracePeriodMs,
  };
}

/**
 * Sweeps orphaned uploads.
 *
 * @param {string} uploadDir
 * @param {object} [options]
 * @param {boolean} [options.apply=false]  Must be `true` to actually delete.
 * @param {number}  [options.gracePeriodMs]
 * @param {number}  [options.now]
 * @returns {Promise<object>} Summary of what happened.
 */
export async function cleanupOrphanedUploads(uploadDir, options = {}) {
  const { apply = false, ...rest } = options;

  const report = await findOrphanedUploads(uploadDir, rest);

  const summary = {
    dryRun: !apply,
    deleted: [],
    failed: [],
    keptCount: report.kept.length,
    skippedRecentCount: report.skippedRecent.length,
    reclaimableBytes: report.totalBytes,
    scannedAt: report.scannedAt,
    gracePeriodMs: report.gracePeriodMs,
  };

  if (!apply) {
    // Report intent only. Nothing is removed.
    summary.deleted = report.orphans.map((file) => ({
      name: file.name,
      size: file.size,
    }));
    return summary;
  }

  for (const file of report.orphans) {
    try {
      await fs.unlink(file.path);
      summary.deleted.push({ name: file.name, size: file.size });
    } catch (error) {
      // A file vanishing between listing and deleting is fine - it's already
      // gone. Anything else is worth surfacing.
      if (error.code !== 'ENOENT') {
        summary.failed.push({ name: file.name, error: error.message });
      }
    }
  }

  return summary;
}

/**
 * Reclaims the image attached to a post that is being deleted.
 *
 * Deliberately conservative: it checks the file isn't referenced by a
 * surviving post or a user avatar before removing it. Two posts can share
 * an image URL (e.g. a user reuses the same upload), and an avatar can
 * legitimately point at the same file.
 *
 * Best-effort - a failure here must never block the post deletion itself.
 *
 * @param {string} imageUrl
 * @param {string} uploadDir
 * @returns {Promise<boolean>} true if a file was removed.
 */
export async function releaseImageIfUnreferenced(imageUrl, uploadDir) {
  if (!imageUrl || typeof imageUrl !== 'string') return false;

  const filename = path.basename(imageUrl.trim());
  if (!filename) return false;

  try {
    const [postStillUses, avatarStillUses] = await Promise.all([
      Post.exists({ imageUrl }),
      User.exists({ avatarUrl: imageUrl }),
    ]);

    if (postStillUses || avatarStillUses) return false;

    return await deleteStoredImage(imageUrl, uploadDir);
  } catch {
    // Never let cleanup failures surface as a failed delete.
    return false;
  }
}
