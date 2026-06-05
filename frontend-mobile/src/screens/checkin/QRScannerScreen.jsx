import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';

const QR_PREFIX = 'badge://checkin';

export default function QRScannerScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || loading) return;

    if (!data.startsWith(QR_PREFIX)) {
      Alert.alert('QR non valido', 'Questo QR code non appartiene a Badge System.', [
        { text: 'Riprova', onPress: () => setScanned(false) },
      ]);
      setScanned(true);
      return;
    }

    setScanned(true);
    setLoading(true);

    try {
      const url = new URL(data);
      const siteId = url.searchParams.get('site_id');
      const clientId = url.searchParams.get('client_id');

      if (!siteId || !clientId) throw new Error('QR incompleto');

      const response = await apiClient.post('/api/checkins', {
        site_id: siteId,
        client_id: clientId,
        type: 'IN',
        timestamp: new Date().toISOString(),
      });

      navigation.replace('Success', {
        checkIn: response.data.data,
        siteId,
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Check-in fallito';
      Alert.alert('Errore check-in', msg, [
        { text: 'Riprova', onPress: () => { setScanned(false); setLoading(false); } },
        { text: 'Annulla', onPress: () => navigation.goBack() },
      ]);
      setLoading(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E3A5F" />
        <Text style={styles.text}>Richiesta permesso fotocamera...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Permesso fotocamera negato</Text>
        <Text style={styles.text}>Vai in Impostazioni → Badge System → Fotocamera per abilitarla.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Torna indietro</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
            <Text style={styles.cancelText}>✕ Annulla</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Scansiona QR Sede</Text>
          <View style={{ width: 80 }} />
        </View>

        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          {loading && <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />}
        </View>

        <Text style={styles.hint}>
          {loading ? 'Registrazione check-in...' : 'Inquadra il QR code della sede'}
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
