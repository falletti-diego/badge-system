/**
 * React App Entry Point
 * Mounts React app to DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
    enabled: import.meta.env.PROD,
    // Strip credential-like strings from all events before sending to Sentry.
    // Prevents temp_password values displayed in the admin panel from leaking
    // into Sentry breadcrumbs or DOM snapshots.
    beforeSend(event) {
      const CREDENTIAL_PATTERN = /(password|token|secret|hash)\s*[=:]\s*\S+/gi;
      const scrub = (s) => (typeof s === 'string' ? s.replace(CREDENTIAL_PATTERN, '$1=[REDACTED]') : s);
      if (event.message) event.message = scrub(event.message);
      if (event.exception?.values) {
        event.exception.values.forEach((ex) => {
          if (ex.value) ex.value = scrub(ex.value);
        });
      }
      return event;
    },
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('❌ Root element not found!');
}
