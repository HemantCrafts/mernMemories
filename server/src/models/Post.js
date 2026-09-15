import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Post content cannot be empty'],
      trim: true,
      maxlength: [560, 'Post cannot exceed 560 characters'],
    },
    imageUrl: {
      type: String,
      default: '',
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// Feed query is "newest first, optionally filtered by author".
postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

postSchema.virtual('likeCount').get(function getLikeCount() {
  return this.likes?.length ?? 0;
});

/**
 * Adds viewer-specific fields so the client knows whether to render
 * a filled or outlined heart without a second request.
 */
postSchema.methods.toClient = function toClient(viewerId) {
  const viewer = viewerId ? String(viewerId) : null;
  const likedByViewer = viewer
    ? this.likes.some((id) => String(id) === viewer)
    : false;

  return {
    id: this._id,
    content: this.content,
    imageUrl: this.imageUrl,
    likeCount: this.likeCount,
    commentCount: this.commentCount,
    likedByViewer,
    isOwnPost: viewer ? String(this.author?._id ?? this.author) === viewer : false,
    author: this.author?.toPublicProfile
      ? this.author.toPublicProfile()
      : this.author,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Post = mongoose.model('Post', postSchema);

export default Post;
