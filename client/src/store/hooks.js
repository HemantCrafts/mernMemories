import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  login as loginThunk,
  register as registerThunk,
  logout as logoutAction,
  updateUser as updateUserAction,
  clearAuthError,
  selectUser,
  selectIsAuthenticated,
  selectBooting,
  selectAuthSubmitting,
  selectAuthError,
} from './slices/authSlice.js';

import {
  cycleTheme as cycleThemeAction,
  setTheme as setThemeAction,
  selectTheme,
  selectThemePreference,
} from './slices/themeSlice.js';

/**
 * Drop-in replacement for the old `useAuth()` hook.
 *
 * Keeps the same shape the components already expect (`user`, `booting`,
 * `isAuthenticated`, `login`, `register`, `logout`, `updateUser`) so the
 * migration is a mechanical import swap rather than a rewrite. `login` throws
 * on failure to preserve the try/catch flow the Login page already has.
 */
export function useAuth() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const booting = useSelector(selectBooting);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const submitting = useSelector(selectAuthSubmitting);
  const error = useSelector(selectAuthError);

  const login = useCallback(
    async (identifier, password) => {
      const result = await dispatch(loginThunk({ identifier, password }));
      if (loginThunk.rejected.match(result)) {
        throw new Error(result.payload || 'Could not sign you in.');
      }
      return result.payload;
    },
    [dispatch]
  );

  const register = useCallback(
    async (payload) => {
      const result = await dispatch(registerThunk(payload));
      if (registerThunk.rejected.match(result)) {
        throw new Error(result.payload || 'Could not create your account.');
      }
      return result.payload;
    },
    [dispatch]
  );

  const logout = useCallback(() => dispatch(logoutAction()), [dispatch]);
  const updateUser = useCallback((patch) => dispatch(updateUserAction(patch)), [dispatch]);
  const clearError = useCallback(() => dispatch(clearAuthError()), [dispatch]);

  return {
    user,
    booting,
    isAuthenticated,
    submitting,
    error,
    login,
    register,
    logout,
    updateUser,
    clearError,
  };
}

/** Theme state plus the toggle action. */
export function useTheme() {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const preference = useSelector(selectThemePreference);

  const cycleTheme = useCallback(() => dispatch(cycleThemeAction()), [dispatch]);
  const setTheme = useCallback((next) => dispatch(setThemeAction(next)), [dispatch]);

  return { theme, preference, cycleTheme, setTheme, isDark: theme === 'dark' };
}
