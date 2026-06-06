import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import NetInfo from '@react-native-community/netinfo';
import authService from '../../services/authService';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function CheckInScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());
  const [faceIdAvailable, setFaceIdAvailable] = useState(false);

  useEffect(() => {
    setLoading(true);
    authService.getUser()
      .then(setUser)
      .finally(() => setLoading(false));

    LocalAuthentication.hasHardwareAsync().then(setFaceIdAvailable);
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const handleCheckIn = async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      Alert.alert('Nessuna connessione', 'Verifica la connessione internet e riprova.');
      return;
    }

    if (faceIdAvailable) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autenticati per il check-in',
        cancelLabel: 'Annulla',
        fallbackLabel: 'Usa passcode',
      });
      if (!result.success) return;
    }

    navigation.navigate('QRScanner');
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Sei sicuro di voler uscire?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci', style: 'destructive',
        onPress: async () => {
          await authService.logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const timeStr = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Ciao, {loading ? '' : (user?.name?.split(' ')[0] ?? '')}! 👋
        </Text>
        <TouchableOpacity onPress={handleLogout} disabled={loading}>
          <Text style={[styles.logoutText, loading && styles.logoutDisabled]}>Esci</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.clockContainer}>
        <Text style={styles.clock}>{timeStr}</Text>
        <Text style={styles.date}>{dateStr}</Text>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.checkinButton} onPress={handleCheckIn}>
          <Text style={styles.checkinIcon}>📱</Text>
          <Text style={styles.checkinButtonText}>Scannerizza QR Code</Text>
          <Text style={styles.checkinSubtext}>
            {faceIdAvailable ? 'Face ID richiesto' : 'Avvicina il telefono al QR'}
          </Text>
        </TouchableOpacity>

        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('MySchedule')}
          >
            <Text style={styles.secondaryIcon}>📅</Text>
            <Text style={styles.secondaryText}>I Miei Turni</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('MyPresences')}
          >
            <Text style={styles.secondaryIcon}>📋</Text>
            <Text style={styles.secondaryText}>Le Mie Presenze</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
    backgroundColor: '#1E3A5F',
  },
  greeting: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  logoutText: { color: '#93C5FD', fontSize: 14 },
  logoutDisabled: { opacity: 0.5 },
  clockContainer: {
    backgroundColor: '#1E3A5F', alignItems: 'center',
    paddingBottom: 40, paddingTop: 24,
  },
  clock: { fontSize: 64, fontWeight: '200', color: '#FFFFFF', letterSpacing: 2 },
  date: { fontSize: 16, color: '#93C5FD', marginTop: 8, textTransform: 'capitalize' },
  actionsContainer: { flex: 1, padding: 24, gap: 20 },
  checkinButton: {
    backgroundColor: '#1E3A5F', borderRadius: 20, padding: 32,
    alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  checkinIcon: { fontSize: 48, marginBottom: 12 },
  checkinButtonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  checkinSubtext: { color: '#93C5FD', fontSize: 14, marginTop: 6 },
  secondaryButtons: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20,
    alignItems: 'center', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  secondaryIcon: { fontSize: 32, marginBottom: 8 },
  secondaryText: { color: '#1E3A5F', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
