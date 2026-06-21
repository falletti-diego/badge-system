import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { toISO, formatDateIT, today } from '../../utils/dateUtils';

export default function IllnessReportScreen() {
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    apiClient.get(ENDPOINTS.ILLNESS_LIST, {
      params: {
        start_date: toISO(threeMonthsAgo),
        end_date: toISO(now),
      },
    })
      .then(r => setReports((r.data.data || []).slice(0, 5)))
      .catch(() => setReports([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSubmit = async () => {
    if (endDate < startDate) {
      Alert.alert('Errore', 'La data di fine deve essere uguale o successiva alla data di inizio.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.ILLNESS_REPORT, {
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        reason: reason.trim() || null,
      });
      Alert.alert(
        '✅ Comunicazione inviata',
        'La comunicazione di malattia è stata registrata. Ricordati di consegnare il certificato medico in azienda entro 2 giorni.'
      );
      setReason('');
      setStartDate(today());
      setEndDate(today());
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Errore invio comunicazione';
      Alert.alert('Errore', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Comunicazione Malattia</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>🏥</Text>
          <Text style={styles.infoText}>
            Comunica il periodo di malattia il prima possibile. Il certificato medico va consegnato in azienda entro 2 giorni lavorativi.
          </Text>
        </View>

        <Text style={styles.label}>Data inizio malattia</Text>
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
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Data fine prevista</Text>
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

        <Text style={styles.label}>Note aggiuntive (opzionale)</Text>
        <TextInput
          style={styles.textInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Es. influenza, febbre alta, visita specialistica"
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
            : <Text style={styles.submitButtonText}>Comunica Malattia</Text>
          }
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Ultimi 3 mesi</Text>
        {historyLoading ? (
          <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 16 }} />
        ) : reports.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna malattia registrata negli ultimi 3 mesi.</Text>
        ) : (
          reports.map(r => (
            <View key={r.id} style={styles.historyItem}>
              <Text style={styles.historyIcon}>🏥</Text>
              <View style={styles.historyContent}>
                <Text style={styles.historyDates}>
                  {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                </Text>
                {r.reason ? <Text style={styles.historyReason}>{r.reason}</Text> : null}
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
  infoBox: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 4,
    borderLeftWidth: 4, borderLeftColor: '#2563EB',
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  infoIcon: { fontSize: 20 },
  infoText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
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
    backgroundColor: '#2563EB', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  historyItem: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 3, borderLeftColor: '#2563EB',
  },
  historyIcon: { fontSize: 20 },
  historyContent: { flex: 1 },
  historyDates: { fontSize: 14, fontWeight: '600', color: '#2A2520' },
  historyReason: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4 },
});
