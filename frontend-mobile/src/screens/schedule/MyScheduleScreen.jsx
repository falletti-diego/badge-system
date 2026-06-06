import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';

const SHIFT_LABELS = { m: 'Mattino', p: 'Pomeriggio', s: 'Sera', R: 'Riposo' };
const SHIFT_COLORS = { m: '#1E3A5F', p: '#B45309', s: '#7C3AED', R: '#6B7280' };
const SHIFT_ICONS = { m: '🌅', p: '☀️', s: '🌙', R: '❌' };

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
  const abortControllerRef = useRef(null);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    apiClient.get(ENDPOINTS.SHIFTS_MY_SCHEDULE, {
      params: { month, year },
      signal: abortControllerRef.current.signal,
    })
      .then(r => {
        if (!abortControllerRef.current?.signal.aborted) {
          setShiftsData(r.data.data?.shifts_data ?? {});
        }
      })
      .catch(e => {
        if (!abortControllerRef.current?.signal.aborted) {
          setError(e.response?.data?.message || 'Errore caricamento turni');
        }
      })
      .finally(() => {
        if (!abortControllerRef.current?.signal.aborted) {
          setLoading(false);
        }
      });

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>I Miei Turni</Text>
        <View style={{ width: 80 }} />
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
      {error && <Text style={styles.errorText}>{error}</Text>}

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
  back: { color: '#93C5FD', fontSize: 16, width: 80 },
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
  errorText: { color: '#C0392B', textAlign: 'center', margin: 24 },
});
