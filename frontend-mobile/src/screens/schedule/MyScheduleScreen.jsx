import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, SHIFTS_CONFIG, STORAGE_KEYS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';

const { LABELS: SHIFT_LABELS, COLORS: SHIFT_COLORS, ICONS: SHIFT_ICONS } = SHIFTS_CONFIG;

function getDaysInMonth(month, year) {
  const days = [];
  const count = new Date(year, month, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

export default function MyScheduleScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [shiftsData, setShiftsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offlineBanner, setOfflineBanner] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchSchedule = (m = month, y = year) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setOfflineBanner(null);

    apiClient.get(ENDPOINTS.SHIFTS_MY_SCHEDULE, {
      params: { month: m, year: y },
      signal: abortControllerRef.current.signal,
    })
      .then(r => {
        if (!abortControllerRef.current?.signal.aborted) {
          const data = r.data.data?.shifts_data ?? {};
          setShiftsData(data);
          AsyncStorage.setItem(
            STORAGE_KEYS.CACHE_SHIFTS,
            JSON.stringify({ savedAt: Date.now(), month: m, year: y, shiftsData: data }),
          ).catch(() => {});
        }
      })
      .catch(async e => {
        if (abortControllerRef.current?.signal.aborted) return;

        if (!e.response) {
          try {
            const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_SHIFTS);
            const cached = raw ? JSON.parse(raw) : null;
            if (cached && cached.month === m && cached.year === y) {
              setShiftsData(cached.shiftsData ?? {});
              setOfflineBanner({ savedAt: cached.savedAt });
              return;
            }
          } catch (cacheErr) {
            // corrupt cache or storage failure — fall through to normal error
          }
        }

        setError(e.response?.data?.message || 'Errore caricamento turni');
      })
      .finally(() => {
        if (!abortControllerRef.current?.signal.aborted) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    fetchSchedule(month, year);
    return () => abortControllerRef.current?.abort();
  }, [month, year]);

  const days = getDaysInMonth(month, year);
  const monthLabel = new Date(year, month - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const assignedCount = Object.values(shiftsData).filter(s => s && s !== 'R').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>I Miei Turni</Text>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{assignedCount}</Text>
          <Text style={styles.kpiLabel}>Turni assegnati</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{days.length}</Text>
          <Text style={styles.kpiLabel}>Giorni nel mese</Text>
        </View>
      </View>

      {loading && <LoadingSpinner color="#1E3A5F" />}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchSchedule(month, year)}
          >
            <Text style={styles.retryButtonText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && offlineBanner && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Sei offline — dati aggiornati al {new Date(offlineBanner.savedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={days}
          keyExtractor={d => d}
          contentContainerStyle={styles.list}
          renderItem={({ item: date }) => {
            const shift = shiftsData[date];
            const dayNum = parseInt(date.split('-')[2]);
            const dayObj = new Date(date + 'T12:00:00');
            const dayName = dayObj.toLocaleDateString('it-IT', { weekday: 'short' });
            const isWeekend = dayObj.getDay() === 0 || dayObj.getDay() === 6;
            const isToday = date === now.toISOString().split('T')[0];

            return (
              <View style={[styles.dayRow, isWeekend && styles.weekend, isToday && styles.today]}>
                <View style={styles.dateCol}>
                  <Text style={[styles.dayNum, isToday && styles.todayText]}>{dayNum}</Text>
                  <Text style={[styles.dayName, isWeekend && styles.weekendText]}>{dayName}</Text>
                </View>
                {shift ? (
                  <View style={[styles.shiftBadge, { backgroundColor: SHIFT_COLORS[shift] + '20' }]}>
                    <Text style={styles.shiftIcon}>{SHIFT_ICONS[shift]}</Text>
                    <Text style={[styles.shiftLabel, { color: SHIFT_COLORS[shift] }]}>
                      {SHIFT_LABELS[shift]}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noShift}>—</Text>
                )}
              </View>
            );
          }}
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
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  monthNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  navBtn: { paddingHorizontal: 12 },
  navText: { fontSize: 28, color: '#1E3A5F', fontWeight: '300' },
  monthLabel: { fontSize: 17, fontWeight: '600', color: '#2A2520', textTransform: 'capitalize' },
  kpiRow: { flexDirection: 'row', padding: 16, gap: 12 },
  kpiCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  kpiValue: { fontSize: 28, fontWeight: '700', color: '#1E3A5F' },
  kpiLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 10, marginBottom: 6, paddingHorizontal: 16, paddingVertical: 12,
  },
  weekend: { backgroundColor: '#F9FAFB' },
  today: { borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  dateCol: { width: 48 },
  dayNum: { fontSize: 18, fontWeight: '600', color: '#2A2520' },
  dayName: { fontSize: 12, color: '#6B7280', textTransform: 'capitalize' },
  weekendText: { color: '#9CA3AF' },
  todayText: { color: '#2563EB' },
  shiftBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 12, gap: 8,
  },
  shiftIcon: { fontSize: 18 },
  shiftLabel: { fontSize: 15, fontWeight: '600' },
  noShift: { flex: 1, textAlign: 'center', color: '#D1D5DB', fontSize: 20, fontWeight: '300' },
  errorContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  errorText: { color: '#C0392B', textAlign: 'center', fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  offlineBanner: {
    backgroundColor: '#FEF6EC', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  offlineBannerText: { color: '#B45309', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
