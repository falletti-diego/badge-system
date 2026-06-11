import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import authService from '../../services/authService';
import { ENDPOINTS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';

const QR_PREFIX = 'badge://checkin';

// Attempt to get current GPS position within the timeout.
// Returns { latitude, longitude } or null if unavailable/denied.
async function tryGetLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export default function QRScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkType, setCheckType] = useState('IN');
  // useRef guard: prevents duplicate submissions from rapid onBarcodeScanned events
  const processingRef = useRef(false);

  const handleBarCodeScanned = async ({ data }) => {
    if (processingRef.current) return;
    processingRef.current = true;

    if (!data.startsWith(QR_PREFIX)) {
      setScanned(true);
      Alert.alert('QR non valido', 'Questo QR code non appartiene a Badge System.', [
        { text: 'Riprova', onPress: () => {
          processingRef.current = false;
          setScanned(false);
        }},
      ]);
      return;
    }

    setScanned(true);
    setLoading(true);

    try {
      const url = new URL(data);
      const siteId = url.searchParams.get('site_id');
      const clientId = url.searchParams.get('client_id');

      if (!siteId || !clientId) throw new Error('QR incompleto');

      const user = await authService.getUser();
      const employeeId = user?.employee_id;

      if (!employeeId) throw new Error('Employee ID non trovato — assicurati di accedere con un account dipendente');

      // Attempt GPS — sent when available; server enforces it only if geofence is enabled
      const location = await tryGetLocation();

      const payload = {
        employee_id: employeeId,
        site_id: siteId,
        client_id: clientId,
        type: checkType,
        timestamp: new Date().toISOString(),
        ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      };

      const response = await apiClient.post(ENDPOINTS.CHECKINS_POST, payload);

      navigation.replace('Success', {
        checkIn: response.data.data,
        siteId,
      });
    } catch (err) {
      const code = err.response?.data?.code;
      const details = err.response?.data?.details;

      let title = 'Errore check-in';
      let msg = err.response?.data?.message || err.message || 'Check-in fallito';

      if (code === 'OUTSIDE_GEOFENCE') {
        title = '📍 Fuori dalla sede';
        msg = `Sei troppo lontano dalla sede.\nDistanza: ${details?.distance_meters ?? '?'}m\nMassimo consentito: ${details?.max_meters ?? '?'}m\n\nAvvicinati alla sede e riprova.`;
      } else if (code === 'GEOFENCE_COORDINATES_REQUIRED' || (err.response?.data?.details?.code === 'GEOFENCE_COORDINATES_REQUIRED')) {
        title = '📍 GPS richiesto';
        msg = 'Questa sede richiede la posizione GPS per il check-in. Attiva il GPS e riprova.';
      }

      Alert.alert(title, msg, [
        { text: 'Riprova', onPress: () => {
          processingRef.current = false;
          setScanned(false);
          setLoading(false);
        }},
        { text: 'Annulla', onPress: () => navigation.goBack() },
      ]);
      setLoading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color="#1E3A5F" />
        <Text style={styles.text}>Richiesta permesso fotocamera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Permesso fotocamera negato</Text>
        <Text style={styles.text}>
          {permission.canAskAgain
            ? 'È necessario il permesso per scansionare il QR code.'
            : 'Vai in Impostazioni → Badge System → Fotocamera per abilitarla.'}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Concedi permesso</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: '#6B7280' }]} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Torna indietro</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
            <Text style={styles.cancelText}>✕ Annulla</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Scansiona QR Sede</Text>
          <View style={{ width: 80 }} />
        </View>

        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeButton, checkType === 'IN' && styles.typeButtonActive]}
            onPress={() => { processingRef.current = false; setCheckType('IN'); setScanned(false); }}
            disabled={loading}
          >
            <Text style={[styles.typeButtonText, checkType === 'IN' && styles.typeButtonTextActive]}>
              ↓ Entrata
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, checkType === 'OUT' && styles.typeButtonActiveOut]}
            onPress={() => { processingRef.current = false; setCheckType('OUT'); setScanned(false); }}
            disabled={loading}
          >
            <Text style={[styles.typeButtonText, checkType === 'OUT' && styles.typeButtonTextActive]}>
              ↑ Uscita
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          {loading && <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />}
        </View>

        <Text style={styles.hint}>
          {loading
            ? (checkType === 'IN' ? 'Registrazione entrata...' : 'Registrazione uscita...')
            : `Inquadra il QR code della sede`}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const CORNER = 24;
const BORDER = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F5F2ED' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', paddingHorizontal: 24, paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cancelText: { color: '#FFFFFF', fontSize: 16, width: 80 },
  topBarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  scanFrame: {
    width: 260, height: 260, justifyContent: 'center', alignItems: 'center',
  },
  corner: {
    position: 'absolute', width: CORNER, height: CORNER,
    borderColor: '#FFFFFF', backgroundColor: 'transparent',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  topRight: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
  spinner: { position: 'absolute' },
  typeToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12, padding: 4, gap: 4,
  },
  typeButton: {
    paddingVertical: 10, paddingHorizontal: 28, borderRadius: 10,
  },
  typeButtonActive: { backgroundColor: '#2D7049' },
  typeButtonActiveOut: { backgroundColor: '#C0392B' },
  typeButtonText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  typeButtonTextActive: { color: '#FFFFFF' },
  hint: {
    color: '#FFFFFF', fontSize: 16, textAlign: 'center',
    paddingHorizontal: 32, paddingBottom: 48,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingVertical: 16, width: '100%',
  },
  text: { color: '#6B7280', fontSize: 15, textAlign: 'center', marginTop: 12 },
  errorText: { color: '#C0392B', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  button: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
