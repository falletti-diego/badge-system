import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';

export default function ChangePasswordScreen({ navigation }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Compila tutti i campi.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La nuova password deve avere almeno 8 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La conferma non coincide con la nuova password.');
      return;
    }
    if (newPassword === oldPassword) {
      setError('La nuova password deve essere diversa da quella attuale.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH_CHANGE_PASSWORD, {
        old_password: oldPassword,
        new_password: newPassword,
      });

      // Backend issues a fresh token pair — persist it so the session continues
      // without forcing a re-login.
      const { token, refresh_token } = response.data.data;
      const pairs = [[STORAGE_KEYS.AUTH_TOKEN, token]];
      if (refresh_token) pairs.push([STORAGE_KEYS.REFRESH_TOKEN, refresh_token]);
      await AsyncStorage.multiSet(pairs);

      Alert.alert('Password aggiornata', 'La tua password è stata cambiata con successo.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Impossibile cambiare la password. Riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>‹ Impostazioni</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Password e sicurezza</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Password attuale</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={oldPassword}
          onChangeText={setOldPassword}
          placeholder="••••••••"
          placeholderTextColor={COLORS.dust}
          editable={!submitting}
        />

        <Text style={styles.label}>Nuova password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Almeno 8 caratteri"
          placeholderTextColor={COLORS.dust}
          editable={!submitting}
        />

        <Text style={styles.label}>Conferma nuova password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          placeholderTextColor={COLORS.dust}
          editable={!submitting}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.submitButtonText}>
            {submitting ? 'Aggiornamento…' : 'Aggiorna password'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  backLink: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy500, marginBottom: 8 },
  title: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  form: { padding: 20 },
  label: { fontFamily: FONTS.bodySemiBold, fontSize: 12, color: COLORS.stone, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.bone,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink,
  },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.error, marginTop: 16 },
  submitButton: {
    height: 56, borderRadius: 14, backgroundColor: COLORS.navy500,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  submitButtonText: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.white },
});
