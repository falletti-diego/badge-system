import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import apiClient from '../../services/apiClient';
import authService from '../../services/authService';
import { ENDPOINTS } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';

export default function SmartWorkingScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authService.getUser().then(setUser);
  }, []);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.SMART_WORKING_CREATE, {});
      Alert.alert('Smart Working confermato', 'La giornata odierna è stata registrata come Smart Working.', [
        { text: 'OK', onPress: () => navigation.replace('CheckInMain') },
      ]);
    } catch (err) {
      if (err.response?.data?.error === 'ALREADY_DECLARED_TODAY') {
        Alert.alert('Già dichiarato', 'Hai già registrato Smart Working per la giornata di oggi.', [
          { text: 'OK', onPress: () => navigation.replace('CheckInMain') },
        ]);
      } else {
        Alert.alert('Errore', err.response?.data?.message || 'Impossibile confermare Smart Working. Riprova.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const dateStr = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateStrCapitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Badge System</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.iconRing}>
          <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
            <Rect x="5" y="8" width="30" height="20" rx="3" stroke={COLORS.navy500} strokeWidth={1.8} fill={COLORS.navy50} />
            <Rect x="9" y="12" width="22" height="12" rx="1.5" fill="#C8D5E8" opacity={0.6} />
            <Line x1="12" y1="15" x2="28" y2="15" stroke={COLORS.navy500} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
            <Line x1="12" y1="18" x2="24" y2="18" stroke={COLORS.navy500} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
            <Line x1="12" y1="21" x2="20" y2="21" stroke={COLORS.navy500} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
            <Line x1="20" y1="28" x2="20" y2="33" stroke={COLORS.navy500} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1="14" y1="33" x2="26" y2="33" stroke={COLORS.navy500} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M17 5.5c1.6-1.2 4.4-1.2 6 0" stroke={COLORS.navy200} strokeWidth={1.2} strokeLinecap="round" fill="none" />
          </Svg>
        </View>

        <Text style={styles.greeting}>Modalità Smart Working</Text>
        <Text style={styles.name}>Buongiorno,{'\n'}{firstName}</Text>

        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>Giornata lavorativa</Text>
          <Text style={styles.dateValue}>{dateStrCapitalized}</Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tipologia</Text>
            <Text style={styles.infoValue}>Smart Working</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Durata</Text>
            <Text style={styles.infoValue}>8 ore</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            La giornata verrà registrata come Smart Working. Non è previsto tracciamento dell'orario.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm} disabled={submitting}>
          <Text style={styles.confirmButtonText}>
            {submitting ? 'Conferma in corso…' : 'Conferma Smart Working'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={submitting}>
          <Text style={styles.cancelButtonText}>Annulla</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  topBar: { paddingHorizontal: 24, paddingTop: 8 },
  logo: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 8 },
  iconRing: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.navy50,
    borderWidth: 1.5, borderColor: COLORS.navy200,
    alignItems: 'center', justifyContent: 'center', marginVertical: 16,
  },
  greeting: {
    fontFamily: FONTS.bodySemiBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
    color: COLORS.navy500, marginBottom: 6,
  },
  name: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink, textAlign: 'center', marginBottom: 20 },
  dateBox: {
    width: '100%', backgroundColor: COLORS.linen, borderRadius: 14, padding: 14, marginBottom: 20, alignItems: 'center',
  },
  dateLabel: {
    fontFamily: FONTS.bodySemiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.stone, marginBottom: 4,
  },
  dateValue: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  infoCard: { width: '100%', backgroundColor: COLORS.linen, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  infoLabel: { fontFamily: FONTS.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: COLORS.stone },
  infoValue: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.ink },
  notice: {
    flexDirection: 'row', width: '100%', backgroundColor: COLORS.navy50,
    borderRadius: 12, padding: 12, gap: 8,
  },
  noticeText: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.navy500, lineHeight: 17 },
  actions: { width: '100%', paddingHorizontal: 24, paddingBottom: 8 },
  confirmButton: {
    height: 56, borderRadius: 14, backgroundColor: COLORS.navy500,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  confirmButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.white },
  cancelButton: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.stone },
});
