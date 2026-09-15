export function Spinner({ size = 'md', className = '' }) {
  const dimensions = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-10 w-10 border-[3px]',
  }[size];

  return (
    <span role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-slate-300 border-t-brand-600 ${dimensions} ${className}`}
    />
  );
}

/** Full-panel loader used while a route's data is in flight. */
export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Inline empty state. */
export function EmptyState({ icon = '🫥', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <div className="text-4xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Red dismissible error banner. */
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
    >
      <span>{message}</span>
      {onDismiss && (
        <button type="button"
          onClick={onDismiss}
          className="shrink-0 rounded text-rose-500 hover:text-rose-700"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}
