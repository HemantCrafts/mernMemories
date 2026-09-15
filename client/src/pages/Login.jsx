import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/hooks.js';
import { ErrorBanner, Spinner } from '../components/Feedback.jsx';

export default function Login() {
  const { login, isAuthenticated, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/';

  // Wait for the session restore to finish before deciding to redirect, otherwise a refresh mid-login would bounce the user around.
  if (!booting && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(identifier.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-black text-white">
          P
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Log in to see what's happening.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        <div>
          <label className="label" htmlFor="identifier">
            Username or email
          </label>
          <input id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required autoFocus placeholder="ada"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required placeholder="••••••••"
            className="input"
          />
        </div>

        <button type="submit"
          disabled={submitting || !identifier || !password}
          className="btn-primary w-full"
        >
          {submitting ? (
            <>
              <Spinner size="sm" className="border-white/40 border-t-white" />
              Logging in…
            </>
          ) : (
            'Log in'
          )}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          No account?{' '}
          <Link to="/register" className="link">
            Sign up
          </Link>
        </p>
      </form>

      <div className="mt-4 rounded-lg border border-slate-200 dark:border-ink-800 bg-white dark:bg-ink-900 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        <p className="font-semibold text-slate-600 dark:text-slate-300">Demo accounts (after running the seed)</p>
        <p className="mt-1">
          <code className="rounded bg-slate-100 dark:bg-ink-800 px-1">ada</code>,{' '}
          <code className="rounded bg-slate-100 dark:bg-ink-800 px-1">linus</code>,{' '}
          <code className="rounded bg-slate-100 dark:bg-ink-800 px-1">grace</code> — password{' '}
          <code className="rounded bg-slate-100 dark:bg-ink-800 px-1">Password123!</code>
        </p>
      </div>
    </div>
  );
}
