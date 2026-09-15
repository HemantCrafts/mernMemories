import { createSlice } from '@reduxjs/toolkit';

/**
 * Theme slice - drives the light/dark mode toggle.
 *
 * `theme` is what the user sees now ('light' | 'dark').
 * `preference` is what they chose ('light' | 'dark' | 'system'), which lets us
 * keep following the OS setting until they explicitly override it.
 *
 * The preference is persisted by redux-persist; the resolved theme is applied
 * to <html class="dark"> by a subscriber in store/index.js.
 */

const PREFERENCE_KEY = 'mernmemories.themePreference';

/** Reads the stored preference. Falls back to 'system'. */
function readStoredPreference() {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // localStorage can throw in private mode - ignore and use the default.
  }
  return 'system';
}

/** Does the OS currently prefer dark? */
function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Turns a preference into the concrete theme to render. */
export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark() ? 'dark' : 'light';
}

const storedPreference = readStoredPreference();

const initialState = {
  preference: storedPreference,
  theme: resolveTheme(storedPreference),
};

/**
 * Applies a preference in one place so `cycleTheme` and `setTheme` can't drift.
 * Note: this runs inside a reducer, so it must stay synchronous and must not
 * depend on anything outside the draft it mutates.
 */
function applyPreference(state, next) {
  state.preference = next;
  state.theme = resolveTheme(next);
  try {
    localStorage.setItem(PREFERENCE_KEY, next);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /** Cycles light -> dark -> system, so all three states are reachable. */
    cycleTheme: (state) => {
      const order = ['light', 'dark', 'system'];
      const next = order[(order.indexOf(state.preference) + 1) % order.length];
      applyPreference(state, next);
    },
    setTheme: (state, action) => {
      const next = action.payload;
      if (next !== 'light' && next !== 'dark' && next !== 'system') return;
      applyPreference(state, next);
    },
    /**
     * Re-resolves when the OS setting changes and the user is on 'system'.
     * The new OS value arrives in the payload - read it from there rather than
     * re-querying matchMedia, so the reducer stays pure and predictable.
     */
    systemThemeChanged: (state, action) => {
      if (state.preference !== 'system') return;
      const prefersDark =
        typeof action.payload === 'boolean' ? action.payload : systemPrefersDark();
      state.theme = prefersDark ? 'dark' : 'light';
    },
  },
});

export const { cycleTheme, setTheme, systemThemeChanged } = themeSlice.actions;

export const selectTheme = (state) => state.theme.theme;
export const selectThemePreference = (state) => state.theme.preference;

export default themeSlice.reducer;
