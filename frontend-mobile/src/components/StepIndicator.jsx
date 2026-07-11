import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../config/theme';

const STEPS = 3;

/**
 * 3-step progress indicator for the Face ID → QR Scanner → Conferma mini-flow.
 * `activeStep` is 1-indexed (1 = Face ID, 2 = QR Scanner, 3 = Conferma).
 */
export default function StepIndicator({ activeStep }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: STEPS }, (_, i) => i + 1).map((step) => (
        <View
          key={step}
          style={[
            styles.dot,
            step === activeStep && styles.dotActive,
            step < activeStep && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.bone,
  },
  dotActive: {
    width: 24, borderRadius: 4,
    backgroundColor: COLORS.navy500,
  },
  dotDone: {
    backgroundColor: COLORS.navy200,
  },
});
