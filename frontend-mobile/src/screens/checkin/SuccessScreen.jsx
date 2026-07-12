import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import authService from '../../services/authService';
import StepIndicator from '../../components/StepIndicator';
import { TIMING } from '../../config/endpoints';
import { COLORS, FONTS, ROLE_LABELS } from '../../config/theme';

export default function SuccessScreen({ navigation, route }) {
  const { checkIn } = route.params ?? {};
  const [user, setUser] = useState(null);
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    authService.getUser().then(setUser);
  }, []);

  useEffect(() => {
    Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [checkScale]);

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('CheckInMain');
    }, TIMING.SUCCESS_AUTO_RETURN);
    return () => clearTimeout(timer);
  }, [navigation]);

  const now = checkIn?.timestamp ? new Date(checkIn.timestamp) : new Date();
  const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const roleLabel = ROLE_LABELS[user?.role] ?? '';
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Animated.View style={[styles.successRing, { transform: [{ scale: checkScale }] }]}>
          <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
            <Circle cx="24" cy="24" r="22" stroke={COLORS.success} strokeWidth={2} fill={COLORS.successBg} />
            <Polyline points="14,24 21,31 34,17" stroke={COLORS.success} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Animated.View>

        <Text style={styles.greeting}>Check-in Registrato</Text>
        <Text style={styles.name}>Buongiorno,{'\n'}{firstName}</Text>
        {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}
        {user?.external_employee_id ? (
          <Text style={styles.employeeId}>#{user.external_employee_id}</Text>
        ) : null}

        <View style={styles.timeDisplay}>
          <Text style={styles.timeBig}>{timeStr}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>

        <View style={styles.detailCard}>
          {user?.external_employee_id && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Employee ID</Text>
              <Text style={styles.detailValueMono}>#{user.external_employee_id}</Text>
            </View>
          )}
          {checkIn?.site_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Punto Vendita</Text>
              <Text style={styles.detailValue}>{checkIn.site_name}</Text>
            </View>
          )}
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Metodo</Text>
            <View style={styles.methodPill}>
              <Text style={styles.methodPillText}>Face ID</Text>
            </View>
          </View>
        </View>

        <StepIndicator activeStep={3} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.replace('CheckInMain')}
        >
          <Text style={styles.doneButtonText}>Fatto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('Presenze')}
        >
          <Text style={styles.historyButtonText}>Vedi storico presenze</Text>
        </TouchableOpacity>
        <Text style={styles.autoReturn}>Ritorno automatico tra 5 secondi...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 12 },
  successRing: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.successBg,
    borderWidth: 2, borderColor: 'rgba(45,112,73,0.2)',
    alignItems: 'center', justifyContent: 'center', marginVertical: 20,
  },
  greeting: {
    fontFamily: FONTS.bodySemiBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase',
    color: COLORS.success, marginBottom: 8,
  },
  name: {
    fontFamily: FONTS.display, fontSize: 32, color: COLORS.ink, textAlign: 'center', marginBottom: 4,
  },
  role: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone },
  employeeId: {
    fontFamily: 'monospace', fontSize: 11, color: COLORS.dust, marginTop: 4, marginBottom: 20, letterSpacing: 0.5,
  },
  timeDisplay: { alignItems: 'center', marginBottom: 20 },
  timeBig: { fontFamily: FONTS.displayLight, fontSize: 56, color: COLORS.ink, letterSpacing: -2 },
  date: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone, marginTop: 6 },
  detailCard: {
    width: '100%', backgroundColor: COLORS.linen, borderRadius: 16, padding: 16, marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  detailLabel: {
    fontFamily: FONTS.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: COLORS.stone,
  },
  detailValue: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.ink },
  detailValueMono: { fontFamily: 'monospace', fontSize: 13, color: COLORS.navy500 },
  methodPill: {
    backgroundColor: COLORS.navy50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  methodPillText: { fontFamily: FONTS.bodySemiBold, fontSize: 11, color: COLORS.navy500 },
  actions: { width: '100%', paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' },
  doneButton: {
    height: 56, width: '100%', borderRadius: 14, backgroundColor: COLORS.navy500,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  doneButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.white },
  historyButton: {
    height: 48, width: '100%', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.navy200,
    alignItems: 'center', justifyContent: 'center',
  },
  historyButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.navy500 },
  autoReturn: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.dust, marginTop: 16 },
});
