import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, CHECKINS_CONFIG } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';
import SkeletonLoader from '../../components/SkeletonLoader';
import { COLORS, FONTS } from '../../config/theme';

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
  const [activeFilter, setActiveFilter] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const abortControllerRef = useRef(null);

  const fetchCheckins = async (filterIndex = activeFilter) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setTruncated(false);

    try {
      const { date_from, date_to } = getDateRange(DATE_FILTERS[filterIndex].days);
      const response = await apiClient.get(ENDPOINTS.CHECKINS_LIST, {
        params: { limit: 200, date_from, date_to },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setCheckins(response.data.data ?? []);
        setTruncated(response.data.pagination?.hasMore === true);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.response?.data?.message || 'Errore caricamento presenze');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Re-fetch when filter changes (while screen is already focused)
  useEffect(() => {
    fetchCheckins(activeFilter);
    return () => abortControllerRef.current?.abort();
  }, [activeFilter]);

  // Re-fetch when user returns to this tab (screen regains focus)
  useFocusEffect(
    useCallback(() => {
      fetchCheckins(activeFilter);
      return () => abortControllerRef.current?.abort();
    }, [activeFilter]),
  );

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
    const initials = employeeName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

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
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>Presenze Store</Text>
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

      {truncated && (
        <View style={styles.truncatedBanner}>
          <Text style={styles.truncatedText}>⚠️ Mostrati solo i 200 check-in più recenti</Text>
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
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: COLORS.navy900,
  },
  title: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.white },

  filterBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.white, gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  filterButton: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.linen, alignItems: 'center',
  },
  filterButtonActive: { backgroundColor: COLORS.navy500 },
  filterText: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.stone },
  filterTextActive: { color: COLORS.white },

  statsBar: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    paddingVertical: 12, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink },
  statLabel: { fontFamily: FONTS.bodySemiBold, fontSize: 11, color: COLORS.dust, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: COLORS.bone, marginVertical: 4 },

  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 12, padding: 14, gap: 12,
  },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.navy500, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontFamily: FONTS.bodySemiBold, color: COLORS.white, fontSize: 14 },

  rowInfo: { flex: 1 },
  employeeName: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  rowDateTime: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.stone, marginTop: 2, textTransform: 'capitalize' },
  rowSite: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.dust, marginTop: 3 },

  typeBadge: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  typeIcon: { fontSize: 16, fontWeight: '700' },
  typeLabel: { fontFamily: FONTS.bodySemiBold, fontSize: 10, marginTop: 1 },

  correctedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.warningBg, justifyContent: 'center', alignItems: 'center',
  },
  correctedText: { fontSize: 12 },

  truncatedBanner: {
    backgroundColor: COLORS.warningBg, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.warning,
  },
  truncatedText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.warning, textAlign: 'center' },
  emptyText: { textAlign: 'center', color: COLORS.stone, fontFamily: FONTS.body, marginTop: 60, fontSize: 16 },
  errorContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  errorText: { color: COLORS.error, textAlign: 'center', fontFamily: FONTS.body, fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: COLORS.navy500, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryButtonText: { color: COLORS.white, fontFamily: FONTS.bodyMedium, fontSize: 15 },
});
