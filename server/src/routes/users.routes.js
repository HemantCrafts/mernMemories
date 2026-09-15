import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Post from '../models/Post.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sanitizeImageUrl } from '../utils/sanitizeImageUrl.js';

const router = Router();

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
}

/**
 * GET /api/users
 * Browse / search users. Public. Supports ?q= and paging.
 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};

    if (req.query.q) {
      const escaped = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ username: rx }, { displayName: rx }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    const viewerFollowing = new Set(
      (req.user?.following ?? []).map((id) => String(id))
    );

    res.json({
      users: users.map((u) => ({
        ...u.toPublicProfile(),
        postCount: undefined,
        isFollowedByViewer: viewerFollowing.has(String(u._id)),
        isSelf: req.user ? String(u._id) === String(req.user._id) : false,
      })),
      page,
      total,
      hasMore: page * limit < total,
    });
  })
);

/**
 * GET /api/users/:username
 * Public profile plus that user's post count.
 */
router.get(
  '/:username',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ username: req.params.username });

    if (!user) throw new ApiError(404, 'User not found');

    const postCount = await Post.countDocuments({ author: user._id });

    const isFollowedByViewer = req.user
      ? user.followers.some((id) => String(id) === String(req.user._id))
      : false;

    res.json({
      user: {
        ...user.toPublicProfile(),
        postCount,
        isFollowedByViewer,
        isSelf: req.user ? String(user._id) === String(req.user._id) : false,
      },
    });
  })
);

/**
 * PATCH /api/users/me
 * Update your own profile fields.
 *
 * `avatarUrl` must reference an image this server stored. This is what stops
 * a profile from pointing at a remote tracking pixel or an arbitrary URL.
 */
router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.body.displayName !== undefined) {
      req.user.displayName = req.body.displayName;
    }

    if (req.body.bio !== undefined) {
      req.user.bio = req.body.bio;
    }

    if (req.body.avatarUrl !== undefined) {
      req.user.avatarUrl = sanitizeImageUrl(req.body.avatarUrl, 'avatarUrl');
    }

    await req.user.save();

    res.json({ user: req.user.toPublicProfile() });
  })
);

/**
 * POST /api/users/:id/follow
 * Toggles the follow relationship in both directions. Cannot follow yourself.
 */
router.post(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'user id');

    const targetId = req.params.id;

    if (String(req.user._id) === String(targetId)) {
      throw new ApiError(400, 'You cannot follow yourself');
    }

    const target = await User.findById(targetId);
    if (!target) throw new ApiError(404, 'User not found');

    const viewerId = String(req.user._id);
    const alreadyFollowing = req.user.following.some(
      (id) => String(id) === String(targetId)
    );

    if (alreadyFollowing) {
      req.user.following = req.user.following.filter(
        (id) => String(id) !== String(targetId)
      );
      target.followers = target.followers.filter((id) => String(id) !== viewerId);
    } else {
      req.user.following.push(target._id);
      target.followers.push(req.user._id);
    }

    await Promise.all([req.user.save(), target.save()]);

    res.json({
      following: !alreadyFollowing,
      followerCount: target.followerCount,
      followingCount: req.user.followingCount,
    });
  })
);

export default router;
