import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../store/hooks.js';
import Avatar from './Avatar.jsx';

/** Sun / moon / monitor icon for the current theme preference. */ function ThemeIcon({ preference }) {
  if (preference === 'light') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (preference === 'dark') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

const THEME_LABEL = {
  light: 'Light theme — click for dark',
  dark: 'Dark theme — click to follow system',
  system: 'Following system — click for light',
};

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { preference, cycleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef(null);

  // Close the avatar dropdown on outside click.
  useEffect(() => {
    if (!menuOpen) return undefined;

    function onClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/explore?q=${encodeURIComponent(q)}`);
    setQuery('');
  }

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-300'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-ink-800 dark:hover:text-slate-100'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm font-black text-white">
            M
          </span>
          <span className="hidden text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:block">
            MERN Memories
          </span>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} className="ml-1 min-w-0 flex-1">
          <label className="sr-only" htmlFor="nav-search">
            Search people
          </label>
          <input id="nav-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="input h-9 max-w-xs"
          />
        </form>

        {/* Theme toggle */}
        <button type="button"
          onClick={cycleTheme}
          title={THEME_LABEL[preference]}
          aria-label={THEME_LABEL[preference]}
          className="btn-ghost h-9 w-9 shrink-0 !px-0"
        >
          <ThemeIcon preference={preference} />
        </button>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Feed
          </NavLink>
          <NavLink to="/explore" className={`${navLinkClass({ isActive: false })} hidden sm:block`}>
            Explore
          </NavLink>

          {isAuthenticated ? (
            <div className="relative ml-1" ref={menuRef}>
              <button type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center rounded-full transition hover:opacity-85"
              >
                <Avatar user={user} size="sm" link={false} />
              </button>

              {menuOpen && (
                <div role="menu"
                  className="absolute right-0 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-ink-800 dark:bg-ink-900"
                >
                  <div className="border-b border-slate-100 px-3.5 py-2.5 dark:border-ink-800">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      @{user.username}
                    </p>
                  </div>

                  <Link to={`/u/${user.username}`}
                    onClick={() => setMenuOpen(false)}
                    className="block px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-ink-800"
                    role="menuitem"
                  >
                    My profile
                  </Link>
                  <Link to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-ink-800"
                    role="menuitem"
                  >
                    Edit profile
                  </Link>
                  <button type="button"
                    onClick={handleLogout}
                    className="block w-full px-3.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    role="menuitem"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="ml-1 flex items-center gap-2">
              <Link to="/login" className="btn-ghost h-9">
                Log in
              </Link>
              <Link to="/register" className="btn-primary h-9">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
