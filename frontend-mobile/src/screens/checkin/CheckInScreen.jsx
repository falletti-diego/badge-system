import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import NetInfo from '@react-native-community/netinfo';
import authService from '../../services/authService';
import LoadingSpinner from '../../components/LoadingSpinner';
import { TIMING } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';

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
    const tick = setInterval(() => setTime(new Date()), TIMING.CLOCK_TICK);
    return () => clearInterval(tick);
  }, []);

  const handleCheckIn = async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      Alert.alert('Nessuna connessione', 'Verifica la connessione internet e riprova.');
      return;
    }

    // Biometric verification gets its own dedicated screen (FaceIDScreen) —
    // devices/simulators without hardware bypass it entirely, same as before.
    navigation.navigate(faceIdAvailable ? 'FaceID' : 'QRScanner');
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
          Ciao, {loading ? '' : (user?.name?.split(' ')[0] ?? '')}
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
          <Text style={styles.checkinButtonText}>Scannerizza QR Code</Text>
          <Text style={styles.checkinSubtext}>
            {faceIdAvailable ? 'Face ID richiesto' : 'Avvicina il telefono al QR'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
    backgroundColor: COLORS.navy900,
  },
  greeting: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.white },
  logoutText: { fontFamily: FONTS.body, color: COLORS.navy200, fontSize: 14 },
  logoutDisabled: { opacity: 0.5 },
  clockContainer: {
    backgroundColor: COLORS.navy900, alignItems: 'center',
    paddingBottom: 40, paddingTop: 8,
  },
  clock: { fontFamily: FONTS.displayLight, fontSize: 68, color: COLORS.white, letterSpacing: -1 },
  date: {
    fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy200,
    marginTop: 6, textTransform: 'capitalize',
  },
  actionsContainer: { flex: 1, padding: 24, gap: 20 },
  checkinButton: {
    backgroundColor: COLORS.navy500, borderRadius: 20, padding: 32,
    alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  checkinButtonText: { fontFamily: FONTS.bodySemiBold, color: COLORS.white, fontSize: 18 },
  checkinSubtext: { fontFamily: FONTS.body, color: COLORS.navy200, fontSize: 14, marginTop: 6 },
});
