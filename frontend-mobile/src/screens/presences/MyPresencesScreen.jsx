import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';

const TYPE_COLORS = { IN: '#166534', OUT: '#7C3AED' };
const TYPE_ICONS = { IN: '→', OUT: '←' };

export default function MyPresencesScreen({ navigation }) {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient.get(ENDPOINTS.CHECKINS_LIST, { params: { limit: 50 } })
      .then(r => setCheckins(r.data.data ?? []))
      .catch(e => setError(e.response?.data?.message || 'Errore caricamento presenze'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Le Mie Presenze</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading && <LoadingSpinner color="#1E3A5F" />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && checkins.length === 0 && !error && (
        <Text style={styles.emptyText}>Nessuna presenza registrata.</Text>
      )}

      <FlatList
        data={checkins}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const ts = new Date(item.timestamp);
          const dateStr = ts.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
          const timeStr = ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          const color = TYPE_COLORS[item.type] ?? '#6B7280';
          const icon = TYPE_ICONS[item.type] ?? '•';

          return (
            <View style={styles.row}>
              <View style={[styles.typeBadge, { backgroundColor: color + '15' }]}>
                <Text style={[styles.typeIcon, { color }]}>{icon}</Text>
                <Text style={[styles.typeLabel, { color }]}>{item.type}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTime}>{timeStr}</Text>
                <Text style={styles.rowDate}>{dateStr}</Text>
                {item.site_name && <Text style={styles.rowSite}>📍 {item.site_name}</Text>}
              </View>
              {item.modified_at && (
                <View style={styles.correctedBadge}>
                  <Text style={styles.correctedText}>✏️</Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1E3A5F',
  },
  back: { color: '#93C5FD', fontSize: 16, width: 80 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 16, gap: 12,
  },
  typeBadge: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
  },
  typeIcon: { fontSize: 20, fontWeight: '700' },
  typeLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  rowInfo: { flex: 1 },
  rowTime: { fontSize: 20, fontWeight: '600', color: '#2A2520' },
  rowDate: { fontSize: 13, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  rowSite: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  correctedBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  correctedText: { fontSize: 14 },
  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 60, fontSize: 16 },
  errorText: { color: '#C0392B', textAlign: 'center', margin: 24 },
});
