import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import { PageLoader, EmptyState } from './components/Feedback.jsx';
import { useAuth } from './store/hooks.js';

/**
 * Route-level code splitting.
 *
 * Each page becomes its own chunk, so the initial bundle only carries the
 * shell (React, Router, Redux) plus the page the user actually landed on.
 * Previously all seven pages were imported eagerly and shipped in one file.
 *
 * NotFound stays a static import - it is tiny and is the fallback for any
 * unmatched URL, so there is no benefit to deferring it.
 */
const Feed = lazy(() => import('./pages/Feed.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Explore = lazy(() => import('./pages/Explore.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const PostDetail = lazy(() => import('./pages/PostDetail.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

/** Redirects to /login and remembers where the user was headed. */
function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) return <PageLoader label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="card">
        <EmptyState
          icon="🧭"
          title="Page not found"
          hint="The page you're looking for doesn't exist."
          action={
            <a href="/" className="btn-primary h-9">
              Go to the feed
            </a>
          }
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <Suspense fallback={<PageLoader label="Loading…" />}>
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="border-t border-slate-200 py-5 dark:border-ink-800">
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          MERN Memories · built with MongoDB, Express, React &amp; Node
        </p>
      </footer>
    </div>
  );
}
