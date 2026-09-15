/** Relative "time ago" formatting used across the feed. */
export function timeAgo(input) {
  const date = new Date(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (Number.isNaN(seconds)) return '';
  if (seconds < 45) return 'just now';

  const units = [
    ['y', 31536000],
    ['mo', 2592000],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];

  for (const [suffix, secondsPerUnit] of units) {
    const amount = Math.floor(seconds / secondsPerUnit);
    if (amount >= 1) return `${amount}${suffix} ago`;
  }

  return 'just now';
}

/** Deterministic pastel-ish color derived from a string, for default avatars. */
export function colorFromString(str = '') {
  const palette = [
    'bg-rose-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-fuchsia-500',
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return palette[Math.abs(hash) % palette.length];
}

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
