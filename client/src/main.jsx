import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

import App from './App.jsx';
import { store, persistor } from './store/index.js';
import { bootstrapSession } from './store/slices/authSlice.js';
import { PageLoader } from './components/Feedback.jsx';
import './index.css';

/**
 * Kicks off the session restore once, after the persisted theme has rehydrated.
 * Mirrors what the old AuthProvider did in its mount effect.
 */
function SessionBootstrapper({ children }) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(bootstrapSession());
  }, [dispatch]);

  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<PageLoader label="Loading MERN Memories…" />} persistor={persistor}>
        <BrowserRouter>
          <SessionBootstrapper>
            <App />
          </SessionBootstrapper>
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
