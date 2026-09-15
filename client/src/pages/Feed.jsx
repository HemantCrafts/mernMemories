import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { postsApi } from '../api/endpoints.js';
import { useAuth } from '../store/hooks.js';
import Composer from '../components/Composer.jsx';
import PostCard from '../components/PostCard.jsx';
import { PageLoader, EmptyState, ErrorBanner, Spinner } from '../components/Feedback.jsx';

export default function Feed() {
  const { user, isAuthenticated } = useAuth();

  const [scope, setScope] = useState('all'); // 'all' | 'following'
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const sentinelRef = useRef(null);

  const load = useCallback(
    async (targetPage, replace) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);

      setError('');

      try {
        const params = { page: targetPage };
        if (scope === 'following') params.feed = 'following';

        const data = await postsApi.list(params);

        setPosts((prev) => (replace ? data.posts : [...prev, ...data.posts]));
        setHasMore(data.hasMore);
        setPage(data.page);
      } catch (err) {
        setError(err.message);
        if (replace) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [scope]
  );

  // Reload from page 1 whenever the scope changes.
  useEffect(() => {
    load(1, true);
  }, [load]);

  // Infinite scroll: fetch the next page when the sentinel scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          load(page + 1, false);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, load]);

  function handlePosted(post) {
    setPosts((prev) => [post, ...prev]);
  }

  function handleDeleted(id) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  function handleLikeChanged(id, likeCount) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likeCount } : p)));
  }

  const scopeTabs = (
    <div className="card flex p-1">
      {[
        { key: 'all', label: 'Everyone' },
        { key: 'following', label: 'Following', authOnly: true },
      ].map((tab) => {
        const disabled = tab.authOnly && !isAuthenticated;
        const active = scope === tab.key;

        return (
          <button key={tab.key}
            type="button"
            disabled={disabled}
            title={disabled ? 'Log in to use this feed' : undefined}
            onClick={() => setScope(tab.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-300'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-ink-800 dark:hover:text-slate-200'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Feed</h1>

      {isAuthenticated ? (
        <Composer onPosted={handlePosted} />
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Log in to post, like and comment.
          </p>
          <div className="flex gap-2">
            <Link to="/login" className="btn-secondary h-9">
              Log in
            </Link>
            <Link to="/register" className="btn-primary h-9">
              Sign up
            </Link>
          </div>
        </div>
      )}

      {scopeTabs}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <PageLoader label="Loading posts…" />
      ) : posts.length === 0 ? (
        <div className="card">
          <EmptyState icon="📭"
            title={scope === 'following' ? 'Your following feed is empty' : 'No posts yet'}
            hint={
              scope === 'following'
                ? 'Follow some people from Explore and their posts will show up here.'
                : 'Be the first to share something.'
            }
            action={
              scope === 'following' ? (
                <Link to="/explore" className="btn-primary h-9">
                  Find people
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id}
                post={post}
                onDeleted={handleDeleted}
                onLikeChanged={handleLikeChanged}
              />
            ))}
          </div>

          {/* Infinite-scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {loadingMore && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              You've reached the end · {posts.length} post{posts.length === 1 ? '' : 's'}
            </p>
          )}
        </>
      )}

      {/* Keyboard hint for the current user's own profile shortcut */}
      {isAuthenticated && user && (
        <p className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
          Signed in as{' '}
          <Link to={`/u/${user.username}`} className="link">
            @{user.username}
          </Link>
        </p>
      )}
    </div>
  );
}
