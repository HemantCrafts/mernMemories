import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { useAuth } from '../store/hooks.js';
import { postsApi } from '../api/endpoints.js';
import { timeAgo } from '../utils/format.js';

/**
 * A single post in the feed.
 *
 * Likes are optimistic: the heart fills instantly and rolls back if the
 * request fails, so the UI never feels laggy on a slow connection.
 */
export default function PostCard({ post, onDeleted, onLikeChanged }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [liked, setLiked] = useState(post.likedByViewer);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pop, setPop] = useState(false);

  const isOwnPost = user && post.author?.username === user.username;

  async function handleLike() {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (busy) return;

    const prevLiked = liked;
    const prevCount = likeCount;

    // Optimistic update
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    setPop(true);
    setError('');
    setBusy(true);

    try {
      const result = await postsApi.toggleLike(post.id);
      // Trust the server's numbers as the source of truth.
      setLiked(result.liked);
      setLikeCount(result.likeCount);
      onLikeChanged?.(post.id, result.likeCount, result.liked);
    } catch (err) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setError(err.message);
    } finally {
      setBusy(false);
      setTimeout(() => setPop(false), 300);
    }
  }

  async function handleDelete() {
    try {
      await postsApi.remove(post.id);
      onDeleted?.(post.id);
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    }
  }

  return (
    <article className="card animate-fade-in p-4 transition-shadow hover:shadow-md">
      <div className="flex gap-3">
        <Avatar user={post.author} size="md" />

        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/u/${post.author?.username}`}
                className="truncate font-semibold text-slate-900 hover:underline dark:text-slate-100"
              >
                {post.author?.displayName || post.author?.username}
              </Link>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                @{post.author?.username} · {timeAgo(post.createdAt)}
              </p>
            </div>

            {isOwnPost && (
              <div className="shrink-0">
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button type="button"
                      onClick={handleDelete}
                      className="rounded-md bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700"
                    >
                      Delete
                    </button>
                    <button type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    aria-label="Delete post"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <Link to={`/post/${post.id}`} className="mt-2 block">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
              {post.content}
            </p>

            {post.imageUrl && (
              <img src={post.imageUrl}
                alt=""
                loading="lazy"
                className="mt-3 max-h-96 w-full rounded-lg border border-slate-200 object-cover dark:border-ink-800"
                onError={(e) => {
                  // Stored image missing or unreadable: hide rather than
                  // render a broken-image placeholder.
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </Link>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <button type="button"
              onClick={handleLike}
              aria-pressed={liked}
              aria-label={liked ? 'Unlike post' : 'Like post'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                liked
                  ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
                  : 'hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-ink-800 dark:hover:text-rose-400'
              }`}
            >
              <span className={pop ? 'animate-pop' : ''}>{liked ? '❤️' : '🤍'}</span>
              <span className="tabular-nums">{likeCount}</span>
            </button>

            <Link to={`/post/${post.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-ink-800 dark:hover:text-brand-400"
            >
              <span>💬</span>
              <span className="tabular-nums">{post.commentCount || 0}</span>
            </Link>
          </div>

          {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      </div>
    </article>
  );
}
