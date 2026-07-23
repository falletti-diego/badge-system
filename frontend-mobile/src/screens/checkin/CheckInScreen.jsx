import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../../services/authService';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getQueue, subscribe } from '../../services/offlineQueue';
import { TIMING, STORAGE_KEYS } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';

export default function CheckInScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());
  const [faceIdAvailable, setFaceIdAvailable] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    authService.getUser()
      .then(setUser)
      .finally(() => setLoading(false));

    LocalAuthentication.hasHardwareAsync().then(setFaceIdAvailable);
    const tick = setInterval(() => setTime(new Date()), TIMING.CLOCK_TICK);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    // Scope the counter to the CURRENTLY logged-in employee: on a shared retail
    // device, a previous employee's still-pending items (left in the queue on
    // purpose — see authService.logout) must not be shown as "your" pending count.
    const countMine = (queue, employeeId) =>
      queue.filter((i) => i.status === 'pending' && i.employee_id === employeeId).length;

    authService.getUser().then((u) => {
      const employeeId = u?.employee_id;
      getQueue().then((q) => setPendingCount(countMine(q, employeeId)));
    });

    const unsubscribe = subscribe((queue) => {
      authService.getUser().then((u) => setPendingCount(countMine(queue, u?.employee_id)));
    });
    return unsubscribe;
  }, []);

  const handleCheckIn = async () => {
    // Biometric verification gets its own dedicated screen (FaceIDScreen) — skipped
    // both when the hardware is unavailable and when the user disabled it in
    // Impostazioni (Preferenze > Face ID). Neither bypass weakens check-in security:
    // ownership is enforced server-side via employee_id in the JWT regardless.
    const faceIdPref = await AsyncStorage.getItem(STORAGE_KEYS.FACE_ID_ENABLED);
    const faceIdWanted = faceIdAvailable && faceIdPref !== 'false';
    navigation.navigate(faceIdWanted ? 'FaceID' : 'QRScanner');
  };

  const timeStr = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Ciao, {loading ? '' : (user?.name?.split(' ')[0] ?? '')}
        </Text>
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

        <TouchableOpacity
          style={styles.smartWorkingButton}
          onPress={() => navigation.navigate('SmartWorking')}
        >
          <Text style={styles.smartWorkingButtonText}>Smart Working</Text>
          <Text style={styles.smartWorkingSubtext}>Autogiustifica la giornata odierna</Text>
        </TouchableOpacity>

        {pendingCount > 0 && (
          <Text style={styles.pendingQueueText}>
            🕓 {pendingCount} timbratura{pendingCount > 1 ? 'e' : ''} in attesa di sincronizzazione
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: {
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
    backgroundColor: COLORS.navy900,
  },
  greeting: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.white },
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
  smartWorkingButton: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.navy200,
  },
  smartWorkingButtonText: { fontFamily: FONTS.bodySemiBold, color: COLORS.navy500, fontSize: 15 },
  smartWorkingSubtext: { fontFamily: FONTS.body, color: COLORS.stone, fontSize: 12, marginTop: 4 },
  pendingQueueText: {
    fontFamily: FONTS.body, color: COLORS.stone, fontSize: 13, textAlign: 'center',
  },
});
