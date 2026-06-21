import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, LEAVE_TYPES } from '../../config/endpoints';
import { toISO, formatDateIT, today } from '../../utils/dateUtils';

const STATUS_COLORS = { PENDING: '#B45309', APPROVED: '#166534', REJECTED: '#991B1B' };
const STATUS_LABELS = { PENDING: 'In attesa', APPROVED: 'Approvata', REJECTED: 'Rifiutata' };

export default function LeaveRequestScreen() {
  const [balance, setBalance] = useState([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [leaveType, setLeaveType] = useState('FERIE_1');
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadBalance = useCallback(() => {
    setBalanceLoading(true);
    apiClient.get(ENDPOINTS.LEAVES_BALANCE)
      .then(r => setBalance(r.data.data || []))
      .catch(() => setBalance([]))
      .finally(() => setBalanceLoading(false));
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    apiClient.get(ENDPOINTS.LEAVES_LIST, { params: { limit: 5 } })
      .then(r => setRequests(r.data.data || []))
      .catch(() => setRequests([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadBalance();
    loadHistory();
  }, [loadBalance, loadHistory]);

  const handleSubmit = async () => {
    if (endDate < startDate) {
      Alert.alert('Errore', 'La data di fine deve essere uguale o successiva alla data di inizio.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
        leave_type: leaveType,
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        reason: reason.trim() || null,
      });
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di ferie è stata inviata al manager per approvazione.');
      setReason('');
      setStartDate(today());
      setEndDate(today());
      loadBalance();
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Errore invio richiesta';
      Alert.alert('Errore', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Richiesta Ferie</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Saldo disponibile</Text>
        <View style={styles.balanceRow}>
          {balanceLoading ? (
            <ActivityIndicator color="#1E3A5F" />
          ) : balance.length === 0 ? (
            <Text style={styles.emptyText}>Saldi non disponibili</Text>
          ) : (
            balance
              .filter(b => ['FERIE_1', 'FERIE_2', 'FERIE_3'].includes(b.leave_type))
              .map(b => {
                const type = LEAVE_TYPES.find(t => t.value === b.leave_type);
                const isActive = leaveType === b.leave_type;
                return (
                  <TouchableOpacity
                    key={b.leave_type}
                    style={[styles.balanceCard, isActive && styles.balanceCardActive]}
                    onPress={() => setLeaveType(b.leave_type)}
                  >
                    <Text style={[styles.balanceDays, isActive && styles.balanceDaysActive]}>
                      {b.remaining_days ?? '—'}
                    </Text>
                    <Text style={[styles.balanceLabel, isActive && styles.balanceLabelActive]}>
                      {type?.label ?? b.leave_type}
                    </Text>
                  </TouchableOpacity>
                );
              })
          )}
        </View>

        <Text style={styles.label}>Tipo ferie</Text>
        <View style={styles.typeRow}>
          {LEAVE_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, leaveType === t.value && styles.typeChipActive]}
              onPress={() => setLeaveType(t.value)}
            >
              <Text style={[styles.typeChipText, leaveType === t.value && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Data inizio</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowStartPicker(true); setShowEndPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(startDate)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={startDate}
              mode="date"
              display="spinner"
              minimumDate={today()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Data fine</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(endDate)}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={endDate}
              mode="date"
              display="spinner"
              minimumDate={startDate}
              locale="it-IT"
              onChange={(_, d) => { if (d) setEndDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowEndPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Motivazione (opzionale)</Text>
        <TextInput
          style={styles.textInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Es. vacanze estive, viaggio familiare"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={2}
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitButtonText}>Invia Richiesta Ferie</Text>
          }
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Ultime richieste</Text>
        {historyLoading ? (
          <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 16 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna richiesta registrata.</Text>
        ) : (
          requests.map(r => (
            <View key={r.id} style={styles.historyItem}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyType}>
                  {LEAVE_TYPES.find(t => t.value === r.leave_type)?.label ?? r.leave_type}
                </Text>
                <Text style={styles.historyDates}>
                  {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[r.status] ?? '#6B7280') + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] ?? '#6B7280' }]}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  balanceCard: {
    flex: 1, minWidth: 90, backgroundColor: '#FFFFFF', borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  balanceCardActive: { borderColor: '#1E3A5F', backgroundColor: '#EFF6FF' },
  balanceDays: { fontSize: 28, fontWeight: '700', color: '#374151' },
  balanceDaysActive: { color: '#1E3A5F' },
  balanceLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  balanceLabelActive: { color: '#1E3A5F', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D1D5DB',
  },
  typeChipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  typeChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  typeChipTextActive: { color: '#FFFFFF' },
  dateButton: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  dateButtonText: { fontSize: 16, color: '#1E3A5F', fontWeight: '500' },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  picker: { height: 150 },
  doneButton: { backgroundColor: '#1E3A5F', paddingVertical: 10, alignItems: 'center' },
  doneButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  textInput: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB', fontSize: 15, color: '#1F2937',
    minHeight: 70, textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#1E3A5F', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  historyItem: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  historyLeft: { flex: 1, marginRight: 8 },
  historyType: { fontSize: 14, fontWeight: '600', color: '#2A2520' },
  historyDates: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4 },
});
