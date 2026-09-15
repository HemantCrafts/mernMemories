import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authApi } from '../../api/endpoints.js';
import { tokenStore } from '../../api/client.js';

/**
 * Auth slice - replaces the old React Context provider.
 *
 * The JWT itself deliberately does NOT live in Redux state. It stays in
 * `tokenStore` (localStorage, key `mernmemories.token`) because:
 *   1. the axios request interceptor reads it outside React, and
 *   2. keeping it out of the persisted store means it is never serialized
 *      into redux-persist alongside the user object.
 * The slice only tracks the resolved user + boot status.
 */

/**
 * Restores a session on app boot by validating the stored token against
 * /auth/me. This is what makes a refresh keep you logged in.
 */
export const bootstrapSession = createAsyncThunk('auth/bootstrap', async (_, { rejectWithValue }) => {
  if (!tokenStore.get()) return null;

  try {
    const { user } = await authApi.me();
    return user;
  } catch (error) {
    // A dead or expired token is not an error worth surfacing - just drop it.
    tokenStore.clear();
    return rejectWithValue(null);
  }
});

export const login = createAsyncThunk('auth/login', async ({ identifier, password }, { rejectWithValue }) => {
  try {
    const { token, user } = await authApi.login({ identifier, password });
    tokenStore.set(token);
    return user;
  } catch (error) {
    return rejectWithValue(error.message || 'Could not sign you in.');
  }
});

export const register = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { token, user } = await authApi.register(payload);
    tokenStore.set(token);
    return user;
  } catch (error) {
    return rejectWithValue(error.message || 'Could not create your account.');
  }
});

const initialState = {
  user: null,
  /** True until the initial token check finishes, so guards don't flash. */
  booting: true,
  /** In-flight state for the login/register forms. */
  submitting: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched by the axios 401 interceptor and the logout button. */
    logout: (state) => {
      tokenStore.clear();
      state.user = null;
      state.error = null;
      state.submitting = false;
    },
    /** Lets profile edits update the navbar avatar without a refetch. */
    updateUser: (state, action) => {
      if (state.user) state.user = { ...state.user, ...action.payload };
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // --- bootstrap ---
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.booting = false;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.user = null;
        state.booting = false;
      })

      // --- login ---
      .addCase(login.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.submitting = false;
        state.user = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.payload ?? 'Could not sign you in.';
      })

      // --- register ---
      .addCase(register.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.submitting = false;
        state.user = action.payload;
      })
      .addCase(register.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.payload ?? 'Could not create your account.';
      });
  },
});

export const { logout, updateUser, clearAuthError } = authSlice.actions;

export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => Boolean(state.auth.user);
export const selectBooting = (state) => state.auth.booting;
export const selectAuthSubmitting = (state) => state.auth.submitting;
export const selectAuthError = (state) => state.auth.error;

export default authSlice.reducer;
