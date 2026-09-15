import { useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import ImageUploader from './ImageUploader.jsx';
import { ErrorBanner, Spinner } from './Feedback.jsx';
import { useAuth } from '../store/hooks.js';
import { postsApi } from '../api/endpoints.js';

const MAX_LENGTH = 560;

/** Compose-and-post box at the top of the feed. */
export default function Composer({ onPosted }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageField, setShowImageField] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const remaining = MAX_LENGTH - content.length;

  // Block posting while an upload is still in flight, otherwise the post would be created without the image the user just picked.
  const [uploading, setUploading] = useState(false);
  const canSubmit =
    content.trim().length > 0 && remaining >= 0 && !submitting && !uploading;

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    try {
      const { post } = await postsApi.create({
        content: content.trim(),
        imageUrl,
      });

      setContent('');
      setImageUrl('');
      setShowImageField(false);

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      onPosted?.(post);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <div className="flex gap-3">
        <Avatar user={user} size="md" link={false} />

        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="composer">
            What's on your mind?
          </label>
          <textarea id="composer"
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                handleSubmit(e);
              }
            }}
            placeholder="What's on your mind?"
            rows={2}
            maxLength={MAX_LENGTH + 50}
            className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder-slate-500"
          />

          {showImageField && (
            <div className="mt-3 animate-fade-in border-t border-slate-100 pt-3 dark:border-ink-800">
              <ImageUploader label="Attach an image"
                variant="banner"
                onUploadingChange={setUploading}
                onUploaded={(url) => {
                  setImageUrl(url);
                  setError('');
                }}
                onCleared={() => setImageUrl('')}
              />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-ink-800">
            <div className="flex items-center gap-1">
              <button type="button"
                onClick={() => setShowImageField((v) => !v)}
                className="rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-brand-600/15 dark:hover:text-brand-300"
                aria-pressed={showImageField}
              >
                🖼️ Image
              </button>

              <span className={`ml-1 text-xs tabular-nums ${
                  remaining < 0
                    ? 'font-semibold text-rose-600 dark:text-rose-400'
                    : remaining < 60
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {remaining}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-400 sm:block dark:text-slate-500">
                ⌘↵ to post
              </span>
              <button type="submit" disabled={!canSubmit} className="btn-primary h-9">
                {submitting ? (
                  <>
                    <Spinner size="sm" className="border-white/40 border-t-white" />
                    Posting…
                  </>
                ) : (
                  'Post'
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3">
              <ErrorBanner message={error} onDismiss={() => setError('')} />
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
