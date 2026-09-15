import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { postsApi } from '../api/endpoints.js';
import { useAuth } from '../store/hooks.js';
import Avatar from '../components/Avatar.jsx';
import PostCard from '../components/PostCard.jsx';
import { PageLoader, EmptyState, ErrorBanner, Spinner } from '../components/Feedback.jsx';
import { timeAgo } from '../utils/format.js';

const MAX_COMMENT = 500;

export default function PostDetail() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await postsApi.get(id);
      setPost(data.post);
      setComments(data.comments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddComment(event) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    setCommentError('');

    try {
      const { comment, commentCount } = await postsApi.addComment(id, content);
      setComments((prev) => [...prev, comment]);
      setPost((prev) => (prev ? { ...prev, commentCount } : prev));
      setDraft('');
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await postsApi.removeComment(id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPost((prev) =>
        prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev
      );
    } catch (err) {
      setCommentError(err.message);
    }
  }

  if (loading) return <PageLoader label="Loading post…" />;

  if (error || !post) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <ErrorBanner message={error || 'Post not found'} />
        <div className="mt-4 card">
          <EmptyState icon="🕳️"
            title="Post not found"
            hint="It may have been deleted by its author."
            action={
              <Link to="/" className="btn-primary h-9">
                Back to feed
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const remaining = MAX_COMMENT - draft.length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <button type="button" onClick={() => navigate(-1)} className="btn-ghost -ml-2 h-8 text-sm">
        ← Back
      </button>

      <PostCard post={post}
        onDeleted={() => navigate('/', { replace: true })}
        onLikeChanged={(postId, likeCount, liked) =>
          setPost((prev) => (prev ? { ...prev, likeCount, likedByViewer: liked } : prev))
        }
      />

      {/* Comment composer */}
      {isAuthenticated ? (
        <form onSubmit={handleAddComment} className="card p-4">
          <div className="flex gap-3">
            <Avatar user={user} size="sm" link={false} />

            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="comment">
                Write a comment
              </label>
              <textarea id="comment"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAddComment(e);
                }}
                placeholder="Write a comment…"
                rows={2}
                maxLength={MAX_COMMENT}
                className="input resize-none"
              />

              <div className="mt-2 flex items-center justify-between">
                <span className={`text-xs tabular-nums ${
                    remaining < 0 ? 'text-rose-600' : remaining < 50 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {remaining}
                </span>

                <button type="submit"
                  disabled={!draft.trim() || submitting}
                  className="btn-primary h-9"
                >
                  {submitting ? <Spinner size="sm" className="border-white/40 border-t-white" /> : null}
                  Comment
                </button>
              </div>

              {commentError && (
                <div className="mt-2">
                  <ErrorBanner message={commentError} onDismiss={() => setCommentError('')} />
                </div>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm text-slate-600 dark:text-slate-300">Log in to join the conversation.</p>
          <Link to="/login" className="btn-primary h-9">
            Log in
          </Link>
        </div>
      )}

      {/* Comments */}
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {comments.length} comment{comments.length === 1 ? '' : 's'}
      </h2>

      {comments.length === 0 ? (
        <div className="card">
          <EmptyState icon="💭" title="No comments yet" hint="Be the first to reply." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {comments.map((comment) => {
            const canDelete =
              comment.isOwnComment || user?.username === post.author?.username;

            return (
              <div key={comment.id} className="card animate-fade-in p-3.5">
                <div className="flex gap-3">
                  <Avatar user={comment.author} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm">
                        <Link to={`/u/${comment.author?.username}`}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:underline"
                        >
                          {comment.author?.displayName}
                        </Link>{' '}
                        <span className="text-slate-400 dark:text-slate-500">· {timeAgo(comment.createdAt)}</span>
                      </p>

                      {canDelete && (
                        <button type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete comment"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
