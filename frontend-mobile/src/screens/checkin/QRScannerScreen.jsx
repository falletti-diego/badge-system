import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';
import authService from '../../services/authService';
import { ENDPOINTS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';

const QR_PREFIX = 'badge://checkin';

export default function QRScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkType, setCheckType] = useState('IN');
  // Guard: prevents duplicate submissions from rapid onBarcodeScanned events
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
      // Robust parsing: new URL() crashes on custom schemes (badge://) in Hermes production
      const qmark = data.indexOf('?');
      const queryString = qmark >= 0 ? data.slice(qmark + 1) : '';
      const params = {};
      queryString.split('&').forEach(pair => {
        const eq = pair.indexOf('=');
        if (eq >= 0) params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
      });
      const siteId = params.site_id || null;
      const clientId = params.client_id || null;

      if (!siteId || !clientId) throw new Error('QR incompleto: parametri site_id o client_id mancanti');

      const user = await authService.getUser();
      const employeeId = user?.employee_id;

      if (!employeeId) throw new Error('Employee ID non trovato — assicurati di accedere con un account dipendente');

      const response = await apiClient.post(ENDPOINTS.CHECKINS_POST, {
        employee_id: employeeId,
        site_id: siteId,
        client_id: clientId,
        type: checkType,
        timestamp: new Date().toISOString(),
      });

      navigation.replace('Success', {
        checkIn: response.data.data,
        siteId,
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Check-in fallito';

      Alert.alert('Errore check-in', msg, [
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
            : 'Inquadra il QR code della sede'}
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
