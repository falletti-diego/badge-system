import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TIMING } from '../../config/endpoints';

export default function SuccessScreen({ navigation, route }) {
  const { checkIn } = route.params ?? {};

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('CheckIn');
    }, TIMING.SUCCESS_AUTO_RETURN);
    return () => clearTimeout(timer);
  }, [navigation]);

  const timeStr = checkIn?.timestamp
    ? new Date(checkIn.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✅</Text>
        </View>

        <Text style={styles.title}>Check-in Registrato!</Text>
        <Text style={styles.time}>{timeStr}</Text>
        <Text style={styles.subtitle}>La tua presenza è stata registrata con successo.</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.replace('CheckIn')}
        >
          <Text style={styles.buttonText}>Torna alla home</Text>
        </TouchableOpacity>

        <Text style={styles.autoReturn}>Ritorno automatico tra 5 secondi...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FDF4' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconContainer: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center',
    marginBottom: 32,
  },
  icon: { fontSize: 64 },
  title: { fontSize: 28, fontWeight: '700', color: '#166534', textAlign: 'center' },
  time: { fontSize: 48, fontWeight: '200', color: '#15803D', marginTop: 16, letterSpacing: 2 },
  subtitle: { fontSize: 16, color: '#4B7A5E', textAlign: 'center', marginTop: 16, lineHeight: 24 },
  button: {
    backgroundColor: '#166534', borderRadius: 12,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 40,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  autoReturn: { color: '#86EFAC', fontSize: 13, marginTop: 20 },
});
