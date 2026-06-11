import React from 'react';
import {
  AlertDialog,
  Button,
  View,
  Text,
  Linking,
  StyleSheet,
} from 'react-native';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A5F',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#2A2520',
    lineHeight: 20,
  },
  link: {
    color: '#0066CC',
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  button: {
    minWidth: 100,
  },
});

/**
 * GPSConsentDialog — GDPR Art. 7 explicit consent for geofencing
 * Shown once per employee before first GPS check-in
 * Non-dismissable (user must choose Accetto or Rifiuto)
 */
export default function GPSConsentDialog({ visible, onConsent, onDecline }) {
  if (!visible) return null;

  const handlePrivacyLink = () => {
    Linking.openURL('https://badge.dataxiom.it/privacy-policy-it');
  };

  return (
    <AlertDialog.Root isOpen={visible}>
      <AlertDialog.Content>
        <View style={styles.container}>
          <Text style={styles.title}>📍 Verifica di Sede</Text>
          <Text style={styles.message}>
            Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare sei fisicamente in sede.{'\n\n'}
            <Text style={{ fontWeight: '600' }}>Dati raccolti:</Text>
            {'\n'}• Latitudine e longitudine al momento del check-in{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Conservazione:</Text>
            {'\n'}• Le coordinate sono cancellate automaticamente dopo 90 giorni{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Diritti:</Text>
            {'\n'}• Puoi rivedere le coordinate via app{'\n'}
            • Puoi richiedere cancellazione anticipata{'\n'}
            • Puoi rifiutare (check-in senza GPS, se disponibile){'\n\n'}
            <Text>
              Per dettagli vedi la{' '}
              <Text
                style={styles.link}
                onPress={handlePrivacyLink}
              >
                Privacy Policy
              </Text>
            </Text>
          </Text>

          <View style={styles.buttonContainer}>
            <Button
              onPress={onDecline}
              title="Rifiuto"
              color="#B91C1C"
              style={styles.button}
            />
            <Button
              onPress={onConsent}
              title="Accetto"
              color="#2D7049"
              style={styles.button}
            />
          </View>
        </View>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
