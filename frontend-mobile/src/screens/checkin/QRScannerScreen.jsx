import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Animated, Easing, Vibration, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import apiClient from '../../services/apiClient';
import authService from '../../services/authService';
import secureAuthStorage from '../../services/secureAuthStorage';
import { enqueueCheckin } from '../../services/offlineQueue';
import { ENDPOINTS, OFFLINE_CONFIG, STORAGE_KEYS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';
import StepIndicator from '../../components/StepIndicator';
import GPSConsentDialog from '../../components/GPSConsentDialog';
import { COLORS, FONTS } from '../../config/theme';
import { isLowEndDevice } from '../../utils/deviceTier';

const QR_PREFIX = 'badge://checkin';
const SUCCESS_FLASH_DURATION = 500;

// Cache locale stato geofencing per sede (Fase C) — stesso pattern di
// MyScheduleScreen/MyPresencesScreen (AsyncStorage, chiave centralizzata in
// config/endpoints.js). Aggiornata ad ogni determinazione certa dello stato:
// check-in online riuscito SENZA GPS (sede non geofenced) o GEOFENCE_COORDINATES_REQUIRED
// (sede geofenced). Usata solo per decidere se bloccare l'accodamento offline —
// stessa finestra di staleness già accettata altrove nell'app per i dati offline.
async function readGeofencingCache() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function writeGeofencingStatus(siteId, geofenced) {
  const cache = await readGeofencingCache();
  cache[siteId] = { geofenced };
  await AsyncStorage.setItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS, JSON.stringify(cache));
}

// true SOLO se la sede è nota in cache come NON geofenced. Sede sconosciuta o nota
// come geofenced → false (fail-safe, blocca l'accodamento offline).
async function isSiteKnownNotGeofenced(siteId) {
  const cache = await readGeofencingCache();
  return cache[siteId]?.geofenced === false;
}

export default function QRScannerScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkType, setCheckType] = useState('IN');
  const faceidVerified = route?.params?.faceidVerified === true;
  // Guard: prevents duplicate submissions from rapid onBarcodeScanned events
  const processingRef = useRef(false);

  const [showConsentDialog, setShowConsentDialog] = useState(false);
  // Conserva payload/siteId tra il primo tentativo (fallito) e il retry con GPS —
  // stesso client_uuid riusato (idempotenza, ON CONFLICT DO NOTHING lato backend).
  const pendingRetryRef = useRef(null);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const pulseDotAnim = useRef(new Animated.Value(0)).current;

  // Scan-line loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanLineAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanLineAnim]);

  // Header status dot pulse — puramente decorativo, disattivato sui device
  // low-end (soglia RAM, deviceTier.js) per ridurre il costo di compositing
  // GPU misurato in Sessione 83 (100% frame jank su Android_Go_LowSpec).
  // Lo scan-line (sopra) resta sempre attivo: ha valore funzionale.
  useEffect(() => {
    if (isLowEndDevice()) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseDotAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseDotAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseDotAnim]);

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

    // Declared here (not `const`/`let` inside the try block below) because `try`/`catch` are
    // separate lexical scopes in JS — a `const`/`let` declared inside `try {}` is NOT
    // visible inside `catch {}`. Referencing either from the catch block would throw a
    // ReferenceError (surfaced by Hermes as "Property 'x' doesn't exist"). `siteId` had the
    // exact same bug as `payload` here — it just never surfaced because execution used to
    // crash on `payload` first, earlier in the same catch block.
    let payload = null;
    let siteId = null;

    try {
      // Robust parsing: new URL() crashes on custom schemes (badge://) in Hermes production
      const qmark = data.indexOf('?');
      const queryString = qmark >= 0 ? data.slice(qmark + 1) : '';
      const params = {};
      queryString.split('&').forEach(pair => {
        const eq = pair.indexOf('=');
        if (eq >= 0) params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
      });
      siteId = params.site_id || null;
      const clientId = params.client_id || null;

      if (!siteId || !clientId) throw new Error('QR incompleto: parametri site_id o client_id mancanti');

      const user = await authService.getUser();
      const employeeId = user?.employee_id;

      if (!employeeId) throw new Error('Employee ID non trovato — assicurati di accedere con un account dipendente');

      // client_uuid/occurred_at are generated for every attempt (even when online): if this
      // POST times out but the server actually received and processed it, the retry (queued
      // below on failure) will be recognized as a duplicate by the backend instead of
      // creating a second check-in ("doppio tap" bug).
      const clientUuid = Crypto.randomUUID();
      const occurredAt = new Date().toISOString();
      payload = {
        employee_id: employeeId,
        site_id: siteId,
        client_id: clientId,     // tenant id — unrelated to client_uuid
        type: checkType,
        timestamp: occurredAt,   // legacy field, harmless to keep sending
        occurred_at: occurredAt, // the field the backend actually reads
        client_uuid: clientUuid, // idempotency key
        faceid_verified: faceidVerified,
        qr_content: data,        // stringa raw scansionata (finding #5) — sempre inclusa,
                                  // indipendentemente dal geofencing, protegge anche le sedi senza GPS
      };

      const response = await apiClient.post(ENDPOINTS.CHECKINS_POST, payload, {
        timeout: OFFLINE_CONFIG.POST_TIMEOUT_OFFLINE_MS,
      });

      await writeGeofencingStatus(siteId, false); // check-in riuscito senza GPS → sede non geofenced

      // Success feedback: vibration + corner brackets flash green before navigating to Conferma
      Vibration.vibrate(500);
      Animated.timing(successAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      setTimeout(() => {
        navigation.replace('Success', {
          checkIn: response.data.data,
          siteId,
        });
      }, SUCCESS_FLASH_DURATION);
    } catch (err) {
      const geofenceCode = err.response?.data?.details?.code;

      if (geofenceCode === 'GEOFENCE_COORDINATES_REQUIRED') {
        pendingRetryRef.current = payload;
        await writeGeofencingStatus(siteId, true);
        const user = await authService.getUser().catch(() => null);
        if (user?.gps_consent_given) {
          await acquireLocationAndRetry();
        } else {
          setShowConsentDialog(true);
        }
        return;
      }

      // `err.isAxiosError && !err.response` — a request that was actually sent but never got
      // a response (offline or POST_TIMEOUT_OFFLINE_MS hit). This must NOT match the manually
      // thrown validation errors above (QR incompleto, employee_id mancante): those have no
      // `.response` either, but they're genuine application errors caught before any request
      // was made, so they must never be queued (and `payload` may still be null at that point).
      if (payload && err.isAxiosError && !err.response) {
        // Network/timeout error — never reached the server. Se sappiamo (da cache locale) che
        // questa sede è geofenced — o non lo sappiamo affatto — non accodiamo: un check-in
        // offline non può mai ricevere l'errore GEOFENCE_COORDINATES_REQUIRED che innesca la
        // richiesta GPS, quindi accodarlo comunque produrrebbe un fallimento silenzioso solo al
        // momento del flush (Fase C, blocco fail-safe).
        const geofencingKnown = await isSiteKnownNotGeofenced(siteId);
        if (!geofencingKnown) {
          Alert.alert(
            'Connessione richiesta',
            'Questa sede richiede una connessione per verificare la posizione al momento del check-in.',
            [
              { text: 'Riprova', onPress: () => {
                processingRef.current = false;
                setScanned(false);
                setLoading(false);
              }},
              { text: 'Annulla', onPress: () => navigation.goBack() },
            ]
          );
          setLoading(false);
          return;
        }

        // Everything below (enqueue + navigate) is wrapped in one try/catch: this exact
        // catch block already crashed the app twice on an unhandled ReferenceError from a
        // variable declared in the try block above but read here (first `payload`, then
        // `siteId` — try/catch are separate lexical scopes in JS). Both are fixed now, but
        // given the same mistake happened twice in a row, any future slip here must surface
        // as a visible alert instead of an untrapped exception that hangs the spinner and
        // takes the app down.
        try {
          await enqueueCheckin(payload);
          navigation.replace('Success', { pending: true, siteId });
          return;
        } catch (queueErr) {
          const msg = queueErr.message || 'Check-in fallito';
          Alert.alert('Errore check-in', msg, [
            { text: 'Riprova', onPress: () => {
              processingRef.current = false;
              setScanned(false);
              setLoading(false);
            }},
            { text: 'Annulla', onPress: () => navigation.goBack() },
          ]);
          setLoading(false);
          return;
        }
      }

      // Application error — a real 4xx/5xx from the server (e.g. wrong site assignment,
      // ownership violation, validation error, OUTSIDE_GEOFENCE, QR_CODE_INVALID). Genuinely
      // invalid, don't enqueue, don't retry automatically.
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

  // Acquisisce la posizione one-shot e ripete la POST con lo stesso client_uuid del
  // tentativo originale (idempotenza). Su timeout/permesso negato mostra un messaggio
  // dedicato con "Riprova" che ritenta SOLO l'acquisizione posizione — il QR resta valido.
  const acquireLocationAndRetry = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({ timeout: 10000 });
      const retryPayload = {
        ...pendingRetryRef.current,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      const response = await apiClient.post(ENDPOINTS.CHECKINS_POST, retryPayload, {
        timeout: OFFLINE_CONFIG.POST_TIMEOUT_OFFLINE_MS,
      });
      Vibration.vibrate(500);
      Animated.timing(successAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      setTimeout(() => {
        navigation.replace('Success', { checkIn: response.data.data, siteId: pendingRetryRef.current?.site_id });
      }, SUCCESS_FLASH_DURATION);
    } catch (locErr) {
      if (locErr?.isAxiosError) {
        // Il retry stesso ha ricevuto una risposta applicativa (es. OUTSIDE_GEOFENCE) —
        // errore finale, nessun ulteriore tentativo automatico.
        const msg = locErr.response?.data?.message || locErr.message || 'Check-in fallito';
        Alert.alert('Errore check-in', msg, [
          { text: 'Riprova', onPress: () => {
            processingRef.current = false;
            setScanned(false);
            setLoading(false);
          }},
          { text: 'Annulla', onPress: () => navigation.goBack() },
        ]);
      } else {
        // Timeout/permesso negato sull'acquisizione GPS stessa.
        Alert.alert('Posizione non disponibile', 'Attiva la posizione per timbrare qui.', [
          { text: 'Riprova', onPress: () => acquireLocationAndRetry() },
          { text: 'Annulla', onPress: () => navigation.goBack() },
        ]);
      }
      setLoading(false);
    }
  };

  const handleConsentAccepted = async () => {
    setShowConsentDialog(false);
    await acquireLocationAndRetry();
  };

  const handleConsentDeclined = () => {
    setShowConsentDialog(false);
    Alert.alert('Check-in bloccato', 'Il consenso alla posizione è necessario per timbrare in questa sede.', [
      { text: 'Riprova', onPress: () => setShowConsentDialog(true) },
      { text: 'Annulla', onPress: () => navigation.goBack() },
    ]);
    setLoading(false);
  };

  const bracketColor = successAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.scanBlue, COLORS.success] });
  // translateY (not `top`) so this can run on the native driver — `top` is a layout
  // property and unsupported by Animated's native driver.
  const scanLineTranslateY = scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 240] });
  const scanLineOpacity = scanLineAnim.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });
  const dotOpacity = isLowEndDevice()
    ? 1
    : pulseDotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });

  if (!permission) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={COLORS.navy500} />
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
        {!permission.canAskAgain && (
          <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
            <Text style={styles.buttonText}>Apri Impostazioni</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: COLORS.stone }]} onPress={() => navigation.goBack()}>
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
          <View style={styles.statusPill}>
            <Animated.View style={[styles.statusDot, { opacity: dotOpacity }]} />
            <Text style={styles.statusPillText}>Fotocamera attiva</Text>
          </View>
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
          <Animated.View style={[styles.corner, styles.topLeft, { borderColor: bracketColor }]} />
          <Animated.View style={[styles.corner, styles.topRight, { borderColor: bracketColor }]} />
          <Animated.View style={[styles.corner, styles.bottomLeft, { borderColor: bracketColor }]} />
          <Animated.View style={[styles.corner, styles.bottomRight, { borderColor: bracketColor }]} />
          {!scanned && (
            <Animated.View
              style={[
                styles.scanLine,
                { opacity: scanLineOpacity, transform: [{ translateY: scanLineTranslateY }] },
              ]}
            />
          )}
          {loading && <ActivityIndicator size="large" color={COLORS.white} style={styles.spinner} />}
        </View>

        <Text style={styles.hint}>
          {loading
            ? (checkType === 'IN' ? 'Registrazione entrata...' : 'Registrazione uscita...')
            : 'Inquadra il QR code della sede'}
        </Text>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigation.navigate('Presenze')} disabled={loading}>
            <Text style={styles.historyLink}>Storico</Text>
          </TouchableOpacity>
        </View>

        <StepIndicator activeStep={2} />
      </SafeAreaView>

      <GPSConsentDialog
        visible={showConsentDialog}
        onConsent={handleConsentAccepted}
        onDecline={handleConsentDeclined}
      />
    </View>
  );
}

const CORNER = 28;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: COLORS.linen },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', paddingHorizontal: 24, paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cancelText: { fontFamily: FONTS.body, color: COLORS.white, fontSize: 16, width: 80 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ADE80' },
  statusPillText: { fontFamily: FONTS.body, color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  scanFrame: {
    width: 260, height: 260, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  corner: {
    position: 'absolute', width: CORNER, height: CORNER, backgroundColor: 'transparent',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 6 },
  topRight: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 6 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 6 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 6 },
  scanLine: {
    position: 'absolute', left: 8, right: 8, height: 2, backgroundColor: COLORS.scanBlue,
  },
  spinner: { position: 'absolute' },
  typeToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12, padding: 4, gap: 4,
  },
  typeButton: {
    paddingVertical: 10, paddingHorizontal: 28, borderRadius: 10,
  },
  typeButtonActive: { backgroundColor: COLORS.success },
  typeButtonActiveOut: { backgroundColor: COLORS.error },
  typeButtonText: { fontFamily: FONTS.bodySemiBold, color: 'rgba(255,255,255,0.6)', fontSize: 15 },
  typeButtonTextActive: { color: COLORS.white },
  hint: {
    fontFamily: FONTS.body, color: COLORS.white, fontSize: 16, textAlign: 'center',
    paddingHorizontal: 32, paddingVertical: 16, width: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  footer: { paddingBottom: 4 },
  historyLink: { fontFamily: FONTS.bodyMedium, color: 'rgba(255,255,255,0.85)', fontSize: 14, paddingBottom: 12 },
  text: { fontFamily: FONTS.body, color: COLORS.stone, fontSize: 15, textAlign: 'center', marginTop: 12 },
  errorText: { fontFamily: FONTS.bodySemiBold, color: COLORS.error, fontSize: 18, marginBottom: 8 },
  button: { backgroundColor: COLORS.navy500, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24 },
  buttonText: { fontFamily: FONTS.bodyMedium, color: COLORS.white, fontSize: 16 },
});
