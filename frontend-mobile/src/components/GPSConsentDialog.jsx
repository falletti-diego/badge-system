import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Alert,
} from 'react-native';
import apiClient from '../services/apiClient';
import secureAuthStorage from '../services/secureAuthStorage';
import { ENDPOINTS } from '../config/endpoints';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineButton: { backgroundColor: '#FBEAEA' },
  declineText: { color: '#B91C1C', fontWeight: '600' },
  acceptButton: { backgroundColor: '#2D7049' },
  acceptText: { color: '#fff', fontWeight: '600' },
});

/**
 * GPSConsentDialog — GDPR Art. 6(1)(f) Legittimo interesse (sicurezza sede,
 * prevenzione frode) + consenso esplicito Art. 7 come layer UX aggiuntivo di
 * trasparenza (allineato alla base giuridica dichiarata in
 * docs/privacy-policy-IT.md, sezione "Base Legale" — NOTA: il campo
 * privacy_policy_version inviato sotto è ancora hardcoded a '2.0', un
 * disallineamento preesistente col numero di versione corrente del
 * documento, non toccato da questa modifica). Shown before il primo
 * check-in su una sede con geofencing attivo, e ad ogni scan successivo
 * finché il dipendente non accetta (nessun cooldown — il check-in resta
 * bloccato su quella sede fino al consenso, Fase C).
 */
export default function GPSConsentDialog({ visible, onConsent, onDecline }) {
  const [submitting, setSubmitting] = useState(false);

  if (!visible) return null;

  const handlePrivacyLink = () => {
    Linking.openURL('https://badge.dataxiom.it/privacy-policy-it');
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.CONSENT_GPS_ACCEPTANCE, {
        consent_given: true,
        privacy_policy_version: '2.0',
      });
      await secureAuthStorage.setUser({ gps_consent_given: true });
      onConsent();
    } catch (err) {
      // Senza questo catch, un fallimento di rete lasciava il dipendente col dialog
      // ancora aperto e nessuna spiegazione — il bottone si riabilitava in silenzio
      // e il check-in non procedeva mai (code review 2026-08-10).
      Alert.alert(
        'Errore',
        'Non è stato possibile registrare il consenso. Verifica la connessione e riprova.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>📍 Verifica di Sede</Text>
          <Text style={styles.message}>
            Il datore di lavoro ha abilitato la verifica di sede (GPS) per motivi di sicurezza e prevenzione frodi. Badge System registra la tua posizione solo al momento del check-in per verificare che tu sia fisicamente in sede.{'\n\n'}
            <Text style={{ fontWeight: '600' }}>Dati raccolti:</Text>
            {'\n'}• Latitudine e longitudine al momento del check-in{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Conservazione:</Text>
            {'\n'}• Le coordinate sono cancellate automaticamente dopo 90 giorni{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Diritti:</Text>
            {'\n'}• Puoi rivedere le coordinate via app{'\n'}
            • Puoi revocare il consenso in qualsiasi momento da Impostazioni{'\n\n'}
            <Text>
              Per dettagli vedi la{' '}
              <Text style={styles.link} onPress={handlePrivacyLink}>
                Privacy Policy
              </Text>
            </Text>
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.declineButton]} onPress={onDecline} disabled={submitting}>
              <Text style={styles.declineText}>Rifiuto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={handleAccept} disabled={submitting}>
              <Text style={styles.acceptText}>Accetto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
