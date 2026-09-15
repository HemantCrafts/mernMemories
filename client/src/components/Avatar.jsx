import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { colorFromString, initialsOf } from '../utils/format.js';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
};

/**
 * Shows the user's avatar image if they have one, otherwise a colored
 * initials circle. Renders as a link unless `link` is false.
 *
 * Avatars are always server-stored paths (/uploads/...). If the image fails
 * to load we fall back to initials rather than leaving a broken image.
 */
export default function Avatar({ user, size = 'md', link = true }) {
  const name = user?.displayName || user?.username || '?';
  const src = user?.avatarUrl || '';

  const [failed, setFailed] = useState(false);

  // Reset the error state when the user or their avatar changes, otherwise a previous failure would permanently mask a newly uploaded image.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  const inner = showImage ? (
    <img src={src}
      alt=""
      loading="lazy"
      className={`shrink-0 rounded-full object-cover ${SIZES[size]}`}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`flex items-center justify-center rounded-full font-bold text-white ${colorFromString(
        user?.username || name
      )} ${SIZES[size]}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );

  if (!link || !user?.username) return inner;

  return (
    <Link to={`/u/${user.username}`} className="shrink-0" aria-label={`${name} profile`}>
      {inner}
    </Link>
  );
}
