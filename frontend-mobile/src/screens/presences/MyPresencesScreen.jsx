import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../../config/endpoints';
import SkeletonLoader from '../../components/SkeletonLoader';
import { pairCheckins, mergeWithSmartWorking, formatDuration } from '../../utils/presenceUtils';
import { COLORS, FONTS } from '../../config/theme';

/** Parses a 'YYYY-MM-DD' key into a local Date (no UTC-parsing ambiguity). */
function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

function buildFilters() {
  const today = new Date();
  const prevMonth1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth2 = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const label = (d) => {
    const s = d.toLocaleDateString('it-IT', { month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return [
    {
      label: 'Questa settimana',
      range: () => ({ date_from: toISODate(startOfWeek(today)), date_to: toISODate(today) }),
    },
    {
      label: 'Questo mese',
      range: () => ({ date_from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)), date_to: toISODate(today) }),
    },
    {
      label: label(prevMonth1),
      range: () => ({
        date_from: toISODate(prevMonth1),
        date_to: toISODate(new Date(prevMonth1.getFullYear(), prevMonth1.getMonth() + 1, 0)),
      }),
    },
    {
      label: label(prevMonth2),
      range: () => ({
        date_from: toISODate(prevMonth2),
        date_to: toISODate(new Date(prevMonth2.getFullYear(), prevMonth2.getMonth() + 1, 0)),
      }),
    },
  ];
}

const FILTERS = buildFilters();

export default function MyPresencesScreen() {
  const [activeFilter, setActiveFilter] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offlineBanner, setOfflineBanner] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async (filterIndex) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setOfflineBanner(null);

    try {
      const { date_from, date_to } = FILTERS[filterIndex].range();
      const [checkinsRes, smartWorkingRes] = await Promise.all([
        apiClient.get(ENDPOINTS.CHECKINS_LIST, { params: { date_from, date_to, limit: 200 }, signal: controller.signal }),
        apiClient.get(ENDPOINTS.SMART_WORKING_HISTORY, { params: { date_from, date_to }, signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      const dailyEntries = pairCheckins(checkinsRes.data.data ?? []);
      const merged = mergeWithSmartWorking(dailyEntries, smartWorkingRes.data.data ?? []);
      setEntries(merged);
      AsyncStorage.setItem(
        STORAGE_KEYS.CACHE_PRESENCES,
        JSON.stringify({ savedAt: Date.now(), filterIndex, entries: merged }),
      ).catch(() => {});
    } catch (err) {
      if (controller.signal.aborted) return;

      if (!err.response) {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_PRESENCES);
          const cached = raw ? JSON.parse(raw) : null;
          if (cached && cached.filterIndex === filterIndex) {
            setEntries(cached.entries ?? []);
            setOfflineBanner({ savedAt: cached.savedAt });
            return;
          }
        } catch (cacheErr) {
          // corrupt cache or storage failure — fall through to normal error
        }
      }

      setError(err.response?.data?.message || 'Errore caricamento presenze');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(activeFilter);
      return () => abortControllerRef.current?.abort();
    }, [activeFilter, fetchData]),
  );

  const totalMinutes = entries
    .filter((e) => e.kind === 'checkin')
    .reduce((sum, e) => sum + (e.totalMinutes || 0), 0);

  // Precompute month-divider markers into the flat list data (rather than mutating
  // a variable during renderItem, which is fragile under FlatList virtualization).
  const listData = [];
  let lastMonthLabel = null;
  entries.forEach((item) => {
    const dateObj = parseDateKey(item.date);
    const rawMonthLabel = dateObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);
    if (monthLabel !== lastMonthLabel) {
      listData.push({ rowType: 'divider', key: `divider-${monthLabel}`, label: monthLabel });
      lastMonthLabel = monthLabel;
    }
    listData.push({ rowType: 'entry', key: `${item.kind}-${item.date}`, item, dateObj });
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Le mie presenze</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
          {FILTERS.map((f, i) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.pill, activeFilter === i && styles.pillActive]}
              onPress={() => setActiveFilter(i)}
            >
              <Text style={[styles.pillText, activeFilter === i && styles.pillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && <SkeletonLoader count={5} />}

      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(activeFilter)}>
            <Text style={styles.retryButtonText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && entries.length === 0 && (
        <Text style={styles.emptyText}>Nessuna presenza nel periodo selezionato.</Text>
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          {offlineBanner && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>
                Sei offline — dati aggiornati al {new Date(offlineBanner.savedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
          <FlatList
            data={listData}
            keyExtractor={(row) => row.key}
            contentContainerStyle={styles.list}
            renderItem={({ item: row }) => {
              if (row.rowType === 'divider') {
                return <Text style={styles.monthDivider}>{row.label}</Text>;
              }

              const { item, dateObj } = row;
              return (
                <View style={styles.row}>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateDay}>{String(dateObj.getDate()).padStart(2, '0')}</Text>
                    <Text style={styles.dateDow}>
                      {dateObj.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')}
                    </Text>
                  </View>
                  <View style={styles.rowInfo}>
                    {item.kind === 'smart_working' ? (
                      <Text style={styles.rowTimesSmartWorking}>Smart Working</Text>
                    ) : (
                      <Text style={styles.rowTimes}>
                        {item.firstIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        {' — '}
                        {item.openPresence || !item.lastOut
                          ? 'in corso'
                          : item.lastOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                    {item.kind === 'checkin' && item.siteName && (
                      <Text style={styles.rowSite}>{item.siteName}</Text>
                    )}
                  </View>
                  {item.kind === 'checkin' && (
                    <Text style={styles.duration}>{formatDuration(item.totalMinutes)}</Text>
                  )}
                </View>
              );
            }}
          />

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Totale ore periodo</Text>
            <Text style={styles.summaryValue}>{formatDuration(totalMinutes)}</Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, marginBottom: 12 },
  pillsRow: { gap: 8 },
  pill: {
    height: 32, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.bone, backgroundColor: COLORS.white,
  },
  pillActive: { backgroundColor: COLORS.navy500, borderColor: COLORS.navy500 },
  pillText: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.stone },
  pillTextActive: { color: COLORS.white },

  monthDivider: {
    fontFamily: FONTS.bodySemiBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: COLORS.dust, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  list: { paddingBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12, gap: 12,
  },
  dateBox: {
    width: 44, height: 52, borderRadius: 10, backgroundColor: COLORS.linen,
    alignItems: 'center', justifyContent: 'center',
  },
  dateDay: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  dateDow: { fontFamily: FONTS.bodySemiBold, fontSize: 9, color: COLORS.stone, textTransform: 'uppercase', marginTop: 1 },
  rowInfo: { flex: 1 },
  rowTimes: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  rowTimesSmartWorking: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.navy500 },
  rowSite: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.stone, marginTop: 2 },
  duration: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy500 },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 16,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.bone,
  },
  summaryLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone },
  summaryValue: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },

  emptyText: { textAlign: 'center', color: COLORS.stone, fontFamily: FONTS.body, marginTop: 60, fontSize: 16 },
  errorContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  errorText: { color: COLORS.error, textAlign: 'center', fontFamily: FONTS.body, fontSize: 16, marginBottom: 16 },
  retryButton: { backgroundColor: COLORS.navy500, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  retryButtonText: { color: COLORS.white, fontFamily: FONTS.bodyMedium, fontSize: 15 },
  offlineBanner: {
    backgroundColor: COLORS.warningBg, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  offlineBannerText: { color: COLORS.warning, fontFamily: FONTS.bodyMedium, fontSize: 13, textAlign: 'center' },
});
