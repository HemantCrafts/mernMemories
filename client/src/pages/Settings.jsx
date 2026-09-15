import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../api/endpoints.js';
import { useAuth } from '../store/hooks.js';
import Avatar from '../components/Avatar.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { ErrorBanner, Spinner } from '../components/Feedback.jsx';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const dirty =
    displayName !== user?.displayName || bio !== user?.bio || avatarUrl !== user?.avatarUrl;

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const { user: updated } = await usersApi.updateMe({ displayName, bio, avatarUrl });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.details?.[0]?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Edit profile</h1>
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-8 text-sm">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5 p-5">
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        {/* Live preview */}
        <div className="flex items-center gap-4 rounded-lg bg-slate-50 dark:bg-ink-800 p-4">
          <Avatar user={{ ...user, displayName, avatarUrl }} size="lg" link={false} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
              {displayName || user.username}
            </p>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">@{user.username}</p>
            {bio && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{bio}</p>}
          </div>
          <span className="ml-auto self-start rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Preview
          </span>
        </div>

        <div>
          <label className="label" htmlFor="displayName">
            Display name
          </label>
          <input id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className="input"
            placeholder="Ada Lovelace"
          />
        </div>

        <div>
          <label className="label" htmlFor="bio">
            Bio
          </label>
          <textarea id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            className="input resize-none"
            placeholder="Tell people a little about yourself"
          />
          <p className={`mt-1 text-xs tabular-nums ${
              bio.length > 140 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {bio.length}/160
          </p>
        </div>

        <div>
          <ImageUploader label="Avatar"
            variant="avatar"
            onUploaded={(url) => setAvatarUrl(url)}
            onCleared={() => setAvatarUrl('')}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Leave empty to use a colored initials avatar.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 dark:border-ink-800 pt-4">
          <button type="submit" disabled={saving || !dirty} className="btn-primary">
            {saving ? (
              <>
                <Spinner size="sm" className="border-white/40 border-t-white" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </button>

          {saved && <span className="text-sm font-medium text-emerald-600">✓ Saved</span>}

          <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            Username and email cannot be changed here.
          </p>
        </div>
      </form>
    </div>
  );
}
