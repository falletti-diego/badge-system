import React from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import RootNavigator from './src/navigation/RootNavigator';

// Initialize Sentry before rendering — only when DSN is provided (graceful degradation)
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    // Automatically capture JS exceptions + native crashes
    enableNativeCrashHandling: true,
  });
}

function App() {
  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

// Wrap with Sentry for automatic error boundary — falls back to plain App if Sentry not initialized
export default process.env.EXPO_PUBLIC_SENTRY_DSN
  ? Sentry.wrap(App)
  : App;
