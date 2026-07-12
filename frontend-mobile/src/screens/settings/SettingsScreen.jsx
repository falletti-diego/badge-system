import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../../services/authService';
import { STORAGE_KEYS } from '../../config/endpoints';
import { COLORS, FONTS, ROLE_LABELS } from '../../config/theme';

function getInitials(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export default function SettingsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [faceIdEnabled, setFaceIdEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      authService.getUser().then(setUser);
      AsyncStorage.getItem(STORAGE_KEYS.FACE_ID_ENABLED).then((value) => {
        setFaceIdEnabled(value !== 'false'); // default true when unset
      });
    }, []),
  );

  const toggleFaceId = async (value) => {
    setFaceIdEnabled(value);
    await AsyncStorage.setItem(STORAGE_KEYS.FACE_ID_ENABLED, value ? 'true' : 'false');
  };

  const handleLogout = () => {
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

  const roleLabel = ROLE_LABELS[user?.role] ?? '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Impostazioni</Text>
      </View>

      {user && (
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.badgeRow}>
              {roleLabel ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleLabel}</Text>
                </View>
              ) : null}
              {user.external_employee_id ? (
                <Text style={styles.employeeId}>#{user.external_employee_id}</Text>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabelDisabled}>Dati personali</Text>
        </View>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChangePassword')}>
          <Text style={styles.rowLabel}>Password e sicurezza</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferenze</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Face ID</Text>
          <Switch
            value={faceIdEnabled}
            onValueChange={toggleFaceId}
            trackColor={{ false: COLORS.bone, true: COLORS.navy500 }}
          />
        </View>
      </View>

      {(user?.client_name || user?.site_name) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Azienda</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{user.client_name || '—'}</Text>
            {user.site_name && <Text style={styles.rowValue}>{user.site_name}</Text>}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Esci dall'account</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.white, margin: 16, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.bone,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.navy500,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: FONTS.bodySemiBold, fontSize: 18, color: COLORS.white },
  name: { fontFamily: FONTS.bodySemiBold, fontSize: 16, color: COLORS.ink },
  email: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.stone, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  rolePill: { backgroundColor: COLORS.navy50, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  rolePillText: { fontFamily: FONTS.bodySemiBold, fontSize: 11, color: COLORS.navy500 },
  employeeId: { fontFamily: 'monospace', fontSize: 10, color: COLORS.dust, letterSpacing: 0.5 },

  section: {
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.bone, overflow: 'hidden',
  },
  sectionTitle: {
    fontFamily: FONTS.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
    color: COLORS.dust, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.linen,
  },
  rowLabel: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink },
  rowLabelDisabled: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.dust },
  rowValue: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone },
  chevron: { fontSize: 18, color: COLORS.bone },

  logoutButton: {
    margin: 16, height: 52, borderRadius: 14, backgroundColor: COLORS.errorBg,
    borderWidth: 1.5, borderColor: 'rgba(192,57,43,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoutText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.error },
});
