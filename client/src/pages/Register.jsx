import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/hooks.js';
import { ErrorBanner, Spinner } from '../components/Feedback.jsx';

/** Client-side checks that mirror the Mongoose schema, so users get
 *  instant feedback instead of a round trip. The server still validates. */ function validate({ username, email, password, confirm }) {
  if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) {
    return 'Username must be 3-24 characters: letters, numbers, _ or . only';
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Please enter a valid email address';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password !== confirm) {
    return 'Passwords do not match';
  }
  return '';
}

export default function Register() {
  const { register, isAuthenticated, booting } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    displayName: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!booting && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        displayName: form.displayName.trim() || form.username.trim(),
        password: form.password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      // Surface per-field server validation details when present.
      const detail = err.details?.[0]?.message;
      setError(detail || err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-black text-white">
          P
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Join MERN Memories and start sharing.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        <div>
          <label className="label" htmlFor="username">
            Username <span className="text-rose-500">*</span>
          </label>
          <input id="username"
            value={form.username}
            onChange={update('username')}
            autoComplete="username"
            required autoFocus placeholder="ada"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Letters, numbers, _ and . · 3-24 chars</p>
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email <span className="text-rose-500">*</span>
          </label>
          <input id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            required placeholder="you@example.com"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="displayName">
            Display name
          </label>
          <input id="displayName"
            value={form.displayName}
            onChange={update('displayName')}
            autoComplete="name"
            placeholder="Ada Lovelace"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Optional — defaults to your username</p>
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password <span className="text-rose-500">*</span>
          </label>
          <input id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            required placeholder="At least 8 characters"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            Confirm password <span className="text-rose-500">*</span>
          </label>
          <input id="confirm"
            type="password"
            value={form.confirm}
            onChange={update('confirm')}
            autoComplete="new-password"
            required placeholder="Repeat your password"
            className="input"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? (
            <>
              <Spinner size="sm" className="border-white/40 border-t-white" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="link">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
