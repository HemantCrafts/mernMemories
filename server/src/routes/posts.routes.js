import { Router } from 'express';
import mongoose from 'mongoose';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sanitizeImageUrl } from '../utils/sanitizeImageUrl.js';
import { config } from '../config/env.js';
import { releaseImageIfUnreferenced } from '../services/cleanupService.js';

const PAGE_SIZE = 20;

/**
 * Builds the posts router.
 *
 * @param {object} [options]
 * @param {string} [options.uploadDir]  Where uploaded images live, so that
 *   deleting a post can release its image. Injected rather than read from
 *   config at module scope, so the directory always matches the one the
 *   uploads router actually wrote to.
 * @param {boolean} [options.awaitCleanup]  When true, the image release is
 *   awaited before responding. Tests use this to avoid racing the assertion;
 *   production leaves it false so a slow filesystem never delays the response.
 */
export default function createPostsRouter(options = {}) {
  const router = Router();
  const uploadDir = options.uploadDir ?? config.uploadDir;
  const awaitCleanup = options.awaitCleanup ?? false;

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
}

/**
 * GET /api/posts?page=1&author=<id>&feed=following
 * Public. Auth optional - a logged-in viewer gets `likedByViewer` flags.
 *
 * Scopes:
 *   (default)      -> every post, newest first
 *   feed=following -> only posts from people the viewer follows (auth required)
 *   author=<id>    -> a single user's posts
 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = {};

    if (req.query.author) {
      assertValidId(req.query.author, 'author id');
      filter.author = req.query.author;
    }

    if (req.query.feed === 'following') {
      if (!req.user) throw new ApiError(401, 'Log in to view your following feed');
      filter.author = { $in: [...req.user.following, req.user._id] };
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate('author', 'username displayName avatarUrl bio followers following'),
      Post.countDocuments(filter),
    ]);

    res.json({
      posts: posts.map((post) => post.toClient(req.user?._id)),
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: page * PAGE_SIZE < total,
    });
  })
);

/**
 * GET /api/posts/:id
 * Single post with its comments inlined.
 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const post = await Post.findById(req.params.id).populate(
      'author',
      'username displayName avatarUrl bio followers following'
    );

    if (!post) throw new ApiError(404, 'Post not found');

    const comments = await Comment.find({ post: post._id })
      .sort({ createdAt: 1 })
      .populate('author', 'username displayName avatarUrl');

    res.json({
      post: post.toClient(req.user?._id),
      comments: comments.map((c) => ({
        id: c._id,
        content: c.content,
        likeCount: c.likeCount,
        author: c.author?.toPublicProfile
          ? c.author.toPublicProfile()
          : c.author,
        createdAt: c.createdAt,
        isOwnComment: req.user
          ? String(c.author?._id ?? c.author) === String(req.user._id)
          : false,
      })),
    });
  })
);

/**
 * POST /api/posts
 * Create a post. Auth required.
 *
 * `imageUrl` is accepted ONLY if it points at an image this server stored
 * (i.e. starts with /uploads/). Arbitrary remote URLs are rejected: they'd
 * let a post embed a tracking pixel or mixed content. Clients must upload
 * through POST /api/uploads first and pass the returned path.
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { content, imageUrl } = req.body;

    if (!content || !content.trim()) {
      throw new ApiError(400, 'Post content cannot be empty');
    }

    const post = await Post.create({
      author: req.user._id,
      content: content.trim(),
      imageUrl: sanitizeImageUrl(imageUrl),
    });

    await post.populate('author', 'username displayName avatarUrl bio followers following');

    res.status(201).json({ post: post.toClient(req.user._id) });
  })
);

/**
 * PATCH /api/posts/:id
 * Edit your own post.
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const post = await Post.findById(req.params.id);
    if (!post) throw new ApiError(404, 'Post not found');

    if (String(post.author) !== String(req.user._id)) {
      throw new ApiError(403, 'You can only edit your own posts');
    }

    const { content, imageUrl } = req.body;

    if (content !== undefined) {
      if (!content.trim()) throw new ApiError(400, 'Post content cannot be empty');
      post.content = content.trim();
    }

    if (imageUrl !== undefined) post.imageUrl = sanitizeImageUrl(imageUrl);

    await post.save();
    await post.populate('author', 'username displayName avatarUrl bio followers following');

    res.json({ post: post.toClient(req.user._id) });
  })
);

/**
 * DELETE /api/posts/:id
 * Deletes your own post and all of its comments.
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const post = await Post.findById(req.params.id);
    if (!post) throw new ApiError(404, 'Post not found');

    if (String(post.author) !== String(req.user._id)) {
      throw new ApiError(403, 'You can only delete your own posts');
    }

    // Capture the image path before the document goes away.
    const orphanedImage = post.imageUrl;

    await Promise.all([
      Comment.deleteMany({ post: post._id }),
      post.deleteOne(),
    ]);

    // Reclaim the image now that no post references it. Deliberately
    // best-effort: a cleanup failure must not fail the delete, and the
    // scheduled sweep will catch anything missed here.
    if (orphanedImage) {
      const release = releaseImageIfUnreferenced(orphanedImage, uploadDir).catch(() => {});

      // In tests we await so the assertion can't race the cleanup.
      if (awaitCleanup) await release;
      else release;
    }

    res.json({ message: 'Post deleted' });
  })
);

/**
 * POST /api/posts/:id/like
 * Toggles a like and returns the fresh count + state.
 */
router.post(
  '/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const post = await Post.findById(req.params.id);
    if (!post) throw new ApiError(404, 'Post not found');

    const userId = String(req.user._id);
    const alreadyLiked = post.likes.some((id) => String(id) === userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => String(id) !== userId);
    } else {
      post.likes.push(req.user._id);
    }

    await post.save();

    res.json({
      liked: !alreadyLiked,
      likeCount: post.likeCount,
      postId: post._id,
    });
  })
);

/**
 * GET /api/posts/:id/comments
 */
router.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate('author', 'username displayName avatarUrl');

    res.json({
      comments: comments.map((c) => ({
        id: c._id,
        content: c.content,
        likeCount: c.likeCount,
        author: c.author?.toPublicProfile ? c.author.toPublicProfile() : c.author,
        createdAt: c.createdAt,
      })),
    });
  })
);

/**
 * POST /api/posts/:id/comments
 * Adds a comment and keeps the denormalized commentCount in sync.
 */
router.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.id, 'post id');

    const { content } = req.body;

    if (!content || !content.trim()) {
      throw new ApiError(400, 'Comment cannot be empty');
    }

    const post = await Post.findById(req.params.id);
    if (!post) throw new ApiError(404, 'Post not found');

    const comment = await Comment.create({
      author: req.user._id,
      post: post._id,
      content: content.trim(),
    });

    await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
    await comment.populate('author', 'username displayName avatarUrl');

    res.status(201).json({
      comment: {
        id: comment._id,
        content: comment.content,
        likeCount: 0,
        author: comment.author.toPublicProfile(),
        createdAt: comment.createdAt,
        isOwnComment: true,
      },
      commentCount: post.commentCount + 1,
    });
  })
);

/**
 * DELETE /api/posts/:postId/comments/:commentId
 * Allowed for the comment author or the post author (moderation).
 */
router.delete(
  '/:postId/comments/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertValidId(req.params.postId, 'post id');
    assertValidId(req.params.commentId, 'comment id');

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) throw new ApiError(404, 'Comment not found');

    const post = await Post.findById(comment.post);

    const isCommentAuthor = String(comment.author) === String(req.user._id);
    const isPostAuthor = post && String(post.author) === String(req.user._id);

    if (!isCommentAuthor && !isPostAuthor) {
      throw new ApiError(403, 'You cannot delete this comment');
    }

    await comment.deleteOne();

    if (post) {
      await Post.updateOne(
        { _id: post._id, commentCount: { $gt: 0 } },
        { $inc: { commentCount: -1 } }
      );
    }

    res.json({ message: 'Comment deleted' });
  })
);

// Silences an unused-import warning while keeping User available for
// future populate-heavy endpoints in this module.
void User;

  return router;
}
