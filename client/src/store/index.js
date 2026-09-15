import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import authReducer, { logout } from './slices/authSlice.js';
import themeReducer, { systemThemeChanged } from './slices/themeSlice.js';

const rootReducer = combineReducers({
  auth: authReducer,
  theme: themeReducer,
});

/**
 * Only `theme` is persisted.
 *
 * `auth` is deliberately excluded: the JWT lives in `tokenStore`
 * (localStorage, key `mernmemories.token`) and the axios interceptor reads it
 * from there. Persisting the user object would also mean a stale profile could
 * reappear after a token had already expired - instead we re-validate against
 * /auth/me on boot, which is what `bootstrapSession` does.
 */
const persistConfig = {
  key: 'mernmemories',
  version: 1,
  storage,
  whitelist: ['theme'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist dispatches these control actions at boot; they carry non-serializable payloads by design, so they must be ignored.
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: import.meta.env.MODE !== 'production',
});

export const persistor = persistStore(store);

/**
 * Applies the resolved theme to <html> and keeps it in sync.
 * The `dark` class is what Tailwind's `darkMode: 'class'` strategy keys off.
 */
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

applyTheme(store.getState().theme.theme);

let lastTheme = store.getState().theme.theme;
store.subscribe(() => {
  const current = store.getState().theme.theme;
  if (current !== lastTheme) {
    lastTheme = current;
    applyTheme(current);
  }
});

/** Keeps 'system' preference honest when the OS flips mid-session. */
if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', (event) => {
    store.dispatch(systemThemeChanged(event.matches));
  });
}

/**
 * Clears auth state when the API reports a dead token.
 *
 * The axios response interceptor already deletes the token from storage and
 * fires `mernmemories:unauthorized`, but it cannot touch Redux itself without
 * creating a circular import. Something has to listen, or the UI keeps
 * rendering a signed-in navbar over a token that no longer works.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('mernmemories:unauthorized', () => {
    store.dispatch(logout());
  });
}
