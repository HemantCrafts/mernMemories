import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usersApi } from '../api/endpoints.js';
import { useAuth } from '../store/hooks.js';
import Avatar from '../components/Avatar.jsx';
import { PageLoader, EmptyState, ErrorBanner } from '../components/Feedback.jsx';

/** A user row with a follow/unfollow button. */ function UserRow({ person, onFollowChanged }) {
  const { isAuthenticated } = useAuth();
  const [following, setFollowing] = useState(person.isFollowedByViewer);
  const [followerCount, setFollowerCount] = useState(person.followerCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (!isAuthenticated || busy) return;

    const prevFollowing = following;
    const prevCount = followerCount;

    setFollowing(!prevFollowing);
    setFollowerCount(prevCount + (prevFollowing ? -1 : 1));
    setBusy(true);
    setError('');

    try {
      const result = await usersApi.toggleFollow(person.id);
      setFollowing(result.following);
      setFollowerCount(result.followerCount);
      onFollowChanged?.(person.id, result.following);
    } catch (err) {
      setFollowing(prevFollowing);
      setFollowerCount(prevCount);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex items-center gap-3 p-3.5">
      <Avatar user={person} size="md" />

      <div className="min-w-0 flex-1">
        <Link to={`/u/${person.username}`}
          className="block truncate font-semibold text-slate-900 dark:text-slate-100 hover:underline"
        >
          {person.displayName}
        </Link>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">
          @{person.username} · {followerCount} follower{followerCount === 1 ? '' : 's'}
        </p>
        {person.bio && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{person.bio}</p>
        )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>

      {!person.isSelf && isAuthenticated && (
        <button type="button"
          onClick={toggle}
          disabled={busy}
          className={following ? 'btn-secondary h-9 shrink-0' : 'btn-primary h-9 shrink-0'}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      )}

      {person.isSelf && (
        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-ink-800 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          You
        </span>
      )}
    </div>
  );
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (q) => {
    setLoading(true);
    setError('');

    try {
      const data = await usersApi.list(q ? { q } : {});
      setPeople(data.users);
    } catch (err) {
      setError(err.message);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search box so we aren't firing a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      load(query.trim());
      setSearchParams(query.trim() ? { q: query.trim() } : {}, { replace: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, load, setSearchParams]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Explore</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Find people to follow.</p>
      </div>

      <div>
        <label className="sr-only" htmlFor="explore-search">
          Search people
        </label>
        <input id="explore-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or display name…"
          className="input"
          autoFocus />
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <PageLoader label="Searching…" />
      ) : people.length === 0 ? (
        <div className="card">
          <EmptyState icon="🔍"
            title={query ? 'No one matches that search' : 'No users yet'}
            hint={
              query
                ? 'Try a different username or display name.'
                : 'Once people sign up they will appear here.'
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {people.map((person) => (
            <UserRow key={person.id}
              person={person}
              onFollowChanged={(id, following) =>
                setPeople((prev) =>
                  prev.map((p) =>
                    p.id === id
                      ? {
                          ...p,
                          isFollowedByViewer: following,
                          followerCount: p.followerCount + (following ? 1 : -1),
                        }
                      : p
                  )
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
