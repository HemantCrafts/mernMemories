import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [24, 'Username cannot exceed 24 characters'],
      match: [/^[a-zA-Z0-9_.]+$/, 'Username may only contain letters, numbers, _ and .'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by default
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [40, 'Display name cannot exceed 40 characters'],
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [160, 'Bio cannot exceed 160 characters'],
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Text search across the fields users actually search on.
userSchema.index({ username: 'text', displayName: 'text' });

userSchema.virtual('displayNameOrUsername').get(function getDisplayNameOrUsername() {
  return this.displayName || this.username;
});

userSchema.virtual('followerCount').get(function getFollowerCount() {
  return this.followers?.length ?? 0;
});

userSchema.virtual('followingCount').get(function getFollowingCount() {
  return this.following?.length ?? 0;
});

/** Hash the password whenever it is set or changed. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

/** Constant-time-ish password comparison. */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Shape sent to the client for the authenticated user. */
userSchema.methods.toPublicProfile = function toPublicProfile() {
  return {
    id: this._id,
    username: this.username,
    displayName: this.displayNameOrUsername,
    bio: this.bio,
    avatarUrl: this.avatarUrl,
    followerCount: this.followerCount,
    followingCount: this.followingCount,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);

export default User;
