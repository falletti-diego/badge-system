import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
 * PushConsentDialog — dialog esplicativo mostrato PRIMA del prompt di
 * permesso push a livello OS, per spiegare il beneficio al dipendente
 * prima che il sistema operativo mostri il proprio prompt (che su iOS non
 * può essere ri-mostrato se rifiutato, se non da Impostazioni). A
 * differenza di GPSConsentDialog, non effettua alcuna chiamata di rete:
 * il flag "già mostrato" e la vera chiamata di richiesta permesso/
 * registrazione token sono responsabilità del chiamante (RootNavigator,
 * da collegare in un task successivo), non di questo componente —
 * accept/decline restano semplici callback e non c'è stato interno
 * persistito.
 */
export default function PushConsentDialog({ visible, onAccept, onDecline }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>🔔 Notifiche</Text>
          <Text style={styles.message}>
            Ricevi un avviso immediato per cambi turno e approvazioni delle tue richieste di ferie ed eventi — direttamente sul telefono, senza dover aprire l'app.
          </Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.declineButton]} onPress={onDecline}>
              <Text style={styles.declineText}>Non ora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={onAccept}>
              <Text style={styles.acceptText}>Attiva</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
