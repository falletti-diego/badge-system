import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { useFonts, Cormorant_300Light, Cormorant_400Regular, Cormorant_500Medium, Cormorant_400Regular_Italic } from '@expo-google-fonts/cormorant';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/config/theme';

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
  const [fontsLoaded] = useFonts({
    Cormorant_300Light,
    Cormorant_400Regular,
    Cormorant_500Medium,
    Cormorant_400Regular_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.navy900 }}>
        <ActivityIndicator size="large" color={COLORS.white} />
      </View>
    );
  }

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
