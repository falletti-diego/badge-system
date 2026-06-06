import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Unified loading spinner component
 * Ensures consistent loading UX across all screens
 */
export default function LoadingSpinner({
  size = 'large',
  color = '#1E3A5F',
  overlay = false,
  style = {},
}) {
  if (overlay) {
    return (
      <View style={[styles.overlayContainer, style]}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
