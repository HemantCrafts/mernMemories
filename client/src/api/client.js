import axios from 'axios';

const TOKEN_KEY = 'mernmemories.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Single axios instance for the whole app.
 * Base URL is relative so Vite's dev proxy handles routing to Express.
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// --- Request: attach the bearer token when we have one --------------------
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response: unwrap data, normalize errors, handle 401 ------------------
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;

    // A 401 on anything other than the login/register calls means the token
    // is dead - clear it and bounce to /login. We use a custom event rather
    // than importing the router to avoid a circular dependency.
    const isAuthEndpoint = /\/auth\/(login|register)/.test(error.config?.url || '');

    if (status === 401 && !isAuthEndpoint) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('mernmemories:unauthorized'));
    }

    if (!error.response) {
      const isTimeout = error.code === 'ECONNABORTED';
      const message = isTimeout
        ? 'The request timed out. Please try again.'
        : 'Cannot reach the server. Is the backend running on port 5000?';
      return Promise.reject(Object.assign(new Error(message), { status: 0 }));
    }

    const payload = error.response.data || {};
    const message = payload.message || `Request failed (${status})`;

    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        details: payload.details,
      })
    );
  }
);

export default api;
