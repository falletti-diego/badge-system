import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, Circle, Path } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import authService from '../../services/authService';
import StepIndicator from '../../components/StepIndicator';
import { COLORS, FONTS } from '../../config/theme';

const ROLE_LABELS = {
  employee: 'Dipendente',
  manager: 'Responsabile',
  admin: 'Amministratore',
  viewer: 'Visualizzatore',
};

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export default function FaceIDScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('authenticating'); // 'authenticating' | 'failed'
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const arcRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    authService.getUser().then(setUser);
  }, []);

  // Ring pulse loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Scan arc rotation loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(arcRotation, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [arcRotation]);

  const runAuthentication = useCallback(async () => {
    setStatus('authenticating');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autenticati per il check-in',
      cancelLabel: 'Annulla',
      fallbackLabel: 'Usa passcode',
    });
    if (result.success) {
      navigation.replace('QRScanner');
    } else {
      setStatus('failed');
    }
  }, [navigation]);

  useEffect(() => {
    // Small delay so the ring animation is visible before the native prompt appears
    const t = setTimeout(runAuthentication, 500);
    return () => clearTimeout(t);
  }, [runAuthentication]);

  const handleChangeUser = () => {
    Alert.alert('Cambia utente', 'Sei sicuro di voler uscire?', [
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

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const arcSpin = arcRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const roleLabel = ROLE_LABELS[user?.role] ?? '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Badge System</Text>
        <TouchableOpacity onPress={handleChangeUser}>
          <Text style={styles.changeUser}>Cambia utente</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Animated.View style={[styles.ringOuter, { transform: [{ scale: pulseScale }] }]}>
          <View style={styles.ringInner}>
            <Animated.View style={[styles.scanArc, { transform: [{ rotate: arcSpin }] }]} />
            <Svg width={56} height={56} viewBox="0 0 56 56" fill="none">
              <Ellipse cx="28" cy="22" rx="16" ry="18" stroke={COLORS.navy500} strokeWidth={1.5} fill={COLORS.navy50} />
              <Circle cx="22" cy="21" r="2.5" fill={COLORS.navy500} />
              <Circle cx="34" cy="21" r="2.5" fill={COLORS.navy500} />
              <Path d="M28 23v4" stroke={COLORS.navy500} strokeWidth={1.2} strokeLinecap="round" />
              <Path d="M25.5 27h5" stroke={COLORS.navy500} strokeWidth={1.2} strokeLinecap="round" />
              <Path d="M23 31c1.3 2 8.7 2 10 0" stroke={COLORS.navy500} strokeWidth={1.5} strokeLinecap="round" fill="none" />
              <Path d="M10 52c0-10 8-17 18-17s18 7 18 17" stroke={COLORS.navy500} strokeWidth={1.5} fill={COLORS.navy50} />
            </Svg>
          </View>
        </Animated.View>

        <Text style={styles.title}>Verifica identità</Text>
        <Text style={styles.subtitle}>
          Guarda il sensore Face ID per completare l'autenticazione ed effettuare il check-in.
        </Text>

        {user && (
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              {roleLabel ? <Text style={styles.userRole}>{roleLabel}</Text> : null}
              {user.external_employee_id ? (
                <Text style={styles.userId}>#{user.external_employee_id}</Text>
              ) : null}
            </View>
          </View>
        )}

        <StepIndicator activeStep={1} />

        {status === 'failed' && (
          <Text style={styles.errorText}>Autenticazione non riuscita. Riprova.</Text>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.authButton}
          onPress={runAuthentication}
          disabled={status === 'authenticating'}
        >
          <Text style={styles.authButtonText}>
            {status === 'authenticating' ? 'Autenticazione in corso…' : 'Riprova'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const RING_OUTER = 180;
const RING_INNER = 140;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 8,
  },
  logo: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  changeUser: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  ringOuter: {
    width: RING_OUTER, height: RING_OUTER, borderRadius: RING_OUTER / 2,
    borderWidth: 1.5, borderColor: COLORS.bone,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  ringInner: {
    width: RING_INNER, height: RING_INNER, borderRadius: RING_INNER / 2,
    borderWidth: 2, borderColor: COLORS.navy500, backgroundColor: COLORS.navy50,
    alignItems: 'center', justifyContent: 'center',
  },
  scanArc: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: (RING_INNER + 8) / 2,
    borderWidth: 2.5, borderColor: 'transparent',
    borderTopColor: COLORS.navy500, borderRightColor: COLORS.navy200,
  },
  title: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink, marginBottom: 8 },
  subtitle: {
    fontFamily: FONTS.body, fontSize: 14, color: COLORS.stone, textAlign: 'center',
    lineHeight: 20, marginBottom: 24, maxWidth: 260,
  },
  userCard: {
    width: '100%', backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.bone,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.navy50,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: FONTS.bodySemiBold, fontSize: 14, color: COLORS.navy500 },
  userInfo: { flex: 1 },
  userName: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  userRole: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.stone, marginTop: 1 },
  userId: { fontFamily: 'monospace', fontSize: 11, color: COLORS.dust, marginTop: 3, letterSpacing: 0.5 },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.error, marginTop: 16, textAlign: 'center' },
  footer: { width: '100%', paddingHorizontal: 24, paddingBottom: 8 },
  authButton: {
    height: 56, borderRadius: 14, backgroundColor: COLORS.navy500,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  authButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.white },
});
