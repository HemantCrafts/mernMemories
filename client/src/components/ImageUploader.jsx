import { useRef, useState } from 'react';
import { uploadsApi } from '../api/endpoints.js';
import { ErrorBanner } from './Feedback.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * File picker + preview for uploading a single image.
 *
 * Replaces the old "paste an image URL" input. The URL field was the source
 * of a real vulnerability (arbitrary remote URLs rendered in an <img>, which
 * enables tracking pixels and mixed content), so uploads are now the only
 * way to attach an image.
 *
 * Client-side checks here are for fast feedback only. The server validates
 * the actual bytes, so nothing here is security-critical.
 *
 * @param {object} props
 * @param {(url: string) => void} props.onUploaded Called with the stored path.
 * @param {() => void} [props.onCleared]
 * @param {string} [props.label]
 * @param {'avatar'|'banner'} [props.variant]
 */
export default function ImageUploader({
  onUploaded,
  onCleared,
  onUploadingChange,
  label = 'Add image',
  variant = 'banner',
}) {
  const inputRef = useRef(null);

  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function setUploadingState(next) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  function reset() {
    setPreview('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');

    // --- Fast client-side checks (server re-validates everything) ---
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP or GIF).');
      reset();
      return;
    }

    if (file.size > MAX_BYTES) {
      setError('That image is larger than 5 MB. Please choose a smaller file.');
      reset();
      return;
    }

    // Local preview straight from the File object - no network needed.
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploadingState(true);

    try {
      const result = await uploadsApi.upload(file, setProgress);
      onUploaded?.(result.url);
      // Swap the blob URL for the server URL so it survives a re-render,
      // then release the object URL to avoid leaking it.
      setPreview(result.url);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message);
      URL.revokeObjectURL(objectUrl);
      reset();
    } finally {
      setUploadingState(false);
    }
  }

  function handleRemove() {
    reset();
    setError('');
    onCleared?.();
  }

  const isAvatar = variant === 'avatar';

  return (
    <div>
      <label className="label">{label}</label>

      <div className={isAvatar ? 'flex items-center gap-4' : ''}>
        {preview && (
          <div className={isAvatar ? '' : 'mb-3'}>
            <img src={preview}
              alt="Upload preview"
              className={
                isAvatar
                  ? 'h-20 w-20 rounded-full border border-slate-200 dark:border-ink-800 object-cover'
                  : 'max-h-56 w-full rounded-lg border border-slate-200 dark:border-ink-800 object-cover'
              }
            />
          </div>
        )}

        <div className={isAvatar ? 'flex flex-col gap-2' : ''}>
          <input ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleChange}
            className="sr-only"
            id={`upload-${variant}-${label.replace(/\s+/g, '-').toLowerCase()}`}
          />

          <div className={isAvatar ? '' : 'flex items-center gap-2'}>
            <button type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="btn-secondary h-9"
            >
              {uploading ? `Uploading ${progress}%…` : preview ? 'Replace' : 'Choose image'}
            </button>

            {preview && !uploading && (
              <button type="button" onClick={handleRemove} className="btn-ghost h-9 text-rose-600">
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
        JPEG, PNG, WebP or GIF · max 5 MB. Metadata (including location) is stripped automatically.
      </p>

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} onDismiss={() => setError('')} />
        </div>
      )}
    </div>
  );
}
