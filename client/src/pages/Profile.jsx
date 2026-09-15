import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { postsApi, usersApi } from '../api/endpoints.js';
import { useAuth } from '../store/hooks.js';
import Avatar from '../components/Avatar.jsx';
import PostCard from '../components/PostCard.jsx';
import { PageLoader, EmptyState, ErrorBanner } from '../components/Feedback.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user: me, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [{ user }, { posts: userPosts }] = await Promise.all([ usersApi.get(username),
        postsApi.list({ author: undefined }),
      ]);

      setProfile(user);
      setFollowing(user.isFollowedByViewer);
      setFollowerCount(user.followerCount);

      // postsApi.list doesn't take a username; filter client-side on the
      // populated author handle so we avoid a second endpoint round trip.
      setPosts(userPosts.filter((p) => p.author?.username === username));
    } catch (err) {
      setError(err.message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset scroll position when navigating between profiles.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [username]);

  async function toggleFollow() {
    if (!isAuthenticated || !profile || busy) return;

    const prevFollowing = following;
    const prevCount = followerCount;

    setFollowing(!prevFollowing);
    setFollowerCount(prevCount + (prevFollowing ? -1 : 1));
    setBusy(true);

    try {
      const result = await usersApi.toggleFollow(profile.id);
      setFollowing(result.following);
      setFollowerCount(result.followerCount);
    } catch (err) {
      setFollowing(prevFollowing);
      setFollowerCount(prevCount);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Loading profile…" />;

  if (error && !profile) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <ErrorBanner message={error} />
        <div className="mt-4 card">
          <EmptyState icon="👻"
            title="User not found"
            hint={`No account exists with the username "${username}".`}
            action={
              <Link to="/explore" className="btn-primary h-9">
                Back to Explore
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const isMe = me?.username === username;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      {/* Profile header */}
      <div className="card overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-brand-500 via-brand-600 to-violet-600" />

        <div className="px-4 pb-4">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="rounded-full border-4 border-white bg-white dark:bg-ink-900">
              <Avatar user={profile} size="xl" link={false} />
            </div>

            <div className="pb-1">
              {isMe ? (
                <Link to="/settings" className="btn-secondary h-9">
                  Edit profile
                </Link>
              ) : (
                isAuthenticated && (
                  <button type="button"
                    onClick={toggleFollow}
                    disabled={busy}
                    className={following ? 'btn-secondary h-9' : 'btn-primary h-9'}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="mt-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {profile.displayName}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>

            {profile.bio && (
              <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                {profile.bio}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
              <span>
                <strong className="font-semibold text-slate-900 dark:text-slate-100">{profile.postCount ?? posts.length}</strong>{' '}
                posts
              </span>
              <span>
                <strong className="font-semibold text-slate-900 dark:text-slate-100">{followerCount}</strong>{' '}
                followers
              </span>
              <span>
                <strong className="font-semibold text-slate-900 dark:text-slate-100">{profile.followingCount}</strong>{' '}
                following
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Posts */}
      <h2 className="px-1 pt-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Posts
      </h2>

      {posts.length === 0 ? (
        <div className="card">
          <EmptyState icon="✍️"
            title={isMe ? "You haven't posted yet" : 'No posts yet'}
            hint={isMe ? 'Your posts will appear here.' : `@${username} hasn't posted anything.`}
            action={
              isMe ? (
                <Link to="/" className="btn-primary h-9">
                  Write a post
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id}
              post={post}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              onLikeChanged={(id, likeCount) =>
                setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likeCount } : p)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
