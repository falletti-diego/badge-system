import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, CHECKINS_CONFIG } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';
import SkeletonLoader from '../../components/SkeletonLoader';

const { TYPE_COLORS, TYPE_ICONS } = CHECKINS_CONFIG;

const DATE_FILTERS = [
  { label: 'Oggi', days: 0 },
  { label: '7 giorni', days: 7 },
  { label: 'Mese', days: 30 },
];

function getDateRange(days) {
  const to = new Date();
  const from = new Date();
  if (days === 0) {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
  }
  return {
    date_from: from.toISOString().split('T')[0],
    date_to: to.toISOString().split('T')[0],
  };
}

export default function StorePresencesScreen({ navigation }) {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(0); // index into DATE_FILTERS
  const abortControllerRef = useRef(null);

  const fetchCheckins = async (filterIndex = activeFilter) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const { date_from, date_to } = getDateRange(DATE_FILTERS[filterIndex].days);
      const response = await apiClient.get(ENDPOINTS.CHECKINS_LIST, {
        params: { limit: 200, date_from, date_to },
        signal: abortControllerRef.current.signal,
      });
      if (!abortControllerRef.current?.signal.aborted) {
        setCheckins(response.data.data ?? []);
      }
    } catch (err) {
      if (!abortControllerRef.current?.signal.aborted) {
        setError(err.response?.data?.message || 'Errore caricamento presenze');
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCheckins(activeFilter);
    return () => abortControllerRef.current?.abort();
  }, [activeFilter]);

  const handleFilterChange = (index) => {
    setActiveFilter(index);
  };

  const renderItem = ({ item }) => {
    const ts = new Date(item.timestamp);
    const dateStr = ts.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const color = TYPE_COLORS[item.type] ?? '#6B7280';
    const icon = TYPE_ICONS[item.type] ?? '•';
    const employeeName = item.employee_name ?? 'Dipendente sconosciuto';
    const initials = employeeName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.rowInfo}>
          <Text style={styles.employeeName}>{employeeName}</Text>
          <Text style={styles.rowDateTime}>{dateStr} · {timeStr}</Text>
          {item.site_name && <Text style={styles.rowSite}>📍 {item.site_name}</Text>}
        </View>

        <View style={[styles.typeBadge, { backgroundColor: color + '15' }]}>
          <Text style={[styles.typeIcon, { color }]}>{icon}</Text>
          <Text style={[styles.typeLabel, { color }]}>{item.type}</Text>
        </View>

        {item.modified_at && (
          <View style={styles.correctedBadge}>
            <Text style={styles.correctedText}>✏️</Text>
          </View>
        )}
      </View>
    );
  };

  const totalIn = checkins.filter(c => c.type === 'IN').length;
  const totalOut = checkins.filter(c => c.type === 'OUT').length;
  const uniqueEmployees = new Set(checkins.map(c => c.employee_id)).size;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Presenze Store</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.filterBar}>
        {DATE_FILTERS.map((f, i) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterButton, activeFilter === i && styles.filterButtonActive]}
            onPress={() => handleFilterChange(i)}
          >
            <Text style={[styles.filterText, activeFilter === i && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!loading && !error && checkins.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{uniqueEmployees}</Text>
            <Text style={styles.statLabel}>Dipendenti</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: TYPE_COLORS.IN }]}>{totalIn}</Text>
            <Text style={styles.statLabel}>Entrate</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: TYPE_COLORS.OUT }]}>{totalOut}</Text>
            <Text style={styles.statLabel}>Uscite</Text>
          </View>
        </View>
      )}

      {loading && <SkeletonLoader count={5} />}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchCheckins()}>
            <Text style={styles.retryButtonText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && checkins.length === 0 && (
        <Text style={styles.emptyText}>Nessuna presenza nel periodo selezionato.</Text>
      )}

      {!loading && !error && checkins.length > 0 && (
        <FlatList
          data={checkins}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
        />
      )}
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

  filterBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFF', gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  filterButton: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', alignItems: 'center',
  },
  filterButtonActive: { backgroundColor: '#1E3A5F' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTextActive: { color: '#FFFFFF' },

  statsBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    paddingVertical: 12, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#2A2520' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },

  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 14, gap: 12,
  },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  rowInfo: { flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '600', color: '#2A2520' },
  rowDateTime: { fontSize: 12, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  rowSite: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },

  typeBadge: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  typeIcon: { fontSize: 16, fontWeight: '700' },
  typeLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },

  correctedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  correctedText: { fontSize: 12 },

  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 60, fontSize: 16 },
  errorContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  errorText: { color: '#C0392B', textAlign: 'center', fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
