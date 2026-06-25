import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const WEB_PLANNING_URL = 'https://badge.dataxiom.it/planning';

export default function ManagerScheduleScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pianificazione Turni</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.icon}>🗓️</Text>
        <Text style={styles.heading}>Gestisci i turni dal web</Text>
        <Text style={styles.description}>
          La pianificazione dei turni per la tua sede si trova sulla dashboard web Badge System.
          Accedi con le tue credenziali di manager.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL(WEB_PLANNING_URL)}
        >
          <Text style={styles.buttonText}>Apri Dashboard Web</Text>
          <Text style={styles.buttonUrl}>badge.dataxiom.it/planning</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Cosa puoi fare dal web:</Text>
          <Text style={styles.infoItem}>• Assegnare turni M/P/S/Riposo per dipendente</Text>
          <Text style={styles.infoItem}>• Vista mensile e settimanale</Text>
          <Text style={styles.infoItem}>• Esportare il piano in PDF/CSV</Text>
          <Text style={styles.infoItem}>• Visualizzare i contatori di turni</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  body: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 56, marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 12 },
  description: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  button: {
    backgroundColor: '#1E3A5F', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
    alignItems: 'center', width: '100%', marginBottom: 28,
    shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  buttonUrl: { color: '#93C5FD', fontSize: 12 },
  infoBox: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, width: '100%',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  infoItem: { fontSize: 13, color: '#6B7280', lineHeight: 22 },
});
