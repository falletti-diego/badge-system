import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { toISO, formatDateIT, toTimeHHMM, today } from '../../utils/dateUtils';

const STATUS_COLORS = { PENDING: '#B45309', APPROVED: '#166534', REJECTED: '#991B1B' };
const STATUS_LABELS = { PENDING: 'In attesa', APPROVED: 'Approvata', REJECTED: 'Rifiutata' };

function defaultStartTime() {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

function defaultEndTime() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  return d;
}

function minEventDate() {
  const d = today();
  d.setDate(d.getDate() - 7);
  return d;
}

export default function EventRequestScreen() {
  const [eventDate, setEventDate] = useState(() => today());
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    apiClient.get(ENDPOINTS.EVENTS_LIST, { params: { limit: 5 } })
      .then(r => setRequests(r.data.data || []))
      .catch(() => setRequests([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSubmit = async () => {
    if (toTimeHHMM(endTime) <= toTimeHHMM(startTime)) {
      Alert.alert('Errore', "L'ora di fine deve essere successiva all'ora di inizio.");
      return;
    }
    if (description.trim().length < 10) {
      Alert.alert('Errore', 'Descrivi il tipo di evento/training con almeno 10 caratteri.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.EVENTS_CREATE, {
        event_date: toISO(eventDate),
        start_time: toTimeHHMM(startTime),
        end_time: toTimeHHMM(endTime),
        description: description.trim(),
      });
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di evento/training è stata inviata al manager per approvazione.');
      setDescription('');
      setEventDate(today());
      setStartTime(defaultStartTime());
      setEndTime(defaultEndTime());
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
        <Text style={styles.title}>Evento / Training</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Data evento</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowDatePicker(true); setShowStartTimePicker(false); setShowEndTimePicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(eventDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={eventDate}
              mode="date"
              display="spinner"
              minimumDate={minEventDate()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setEventDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.label}>Ora inizio</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => { setShowStartTimePicker(true); setShowDatePicker(false); setShowEndTimePicker(false); }}
            >
              <Text style={styles.dateButtonText}>🕐  {toTimeHHMM(startTime)}</Text>
            </TouchableOpacity>
            {showStartTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="spinner"
                  locale="it-IT"
                  onChange={(_, d) => { if (d) setStartTime(d); }}
                  style={styles.picker}
                />
                <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartTimePicker(false)}>
                  <Text style={styles.doneButtonText}>Fine</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.timeCol}>
            <Text style={styles.label}>Ora fine</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => { setShowEndTimePicker(true); setShowDatePicker(false); setShowStartTimePicker(false); }}
            >
              <Text style={styles.dateButtonText}>🕐  {toTimeHHMM(endTime)}</Text>
            </TouchableOpacity>
            {showEndTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="spinner"
                  locale="it-IT"
                  onChange={(_, d) => { if (d) setEndTime(d); }}
                  style={styles.picker}
                />
                <TouchableOpacity style={styles.doneButton} onPress={() => setShowEndTimePicker(false)}>
                  <Text style={styles.doneButtonText}>Fine</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.label}>Descrizione evento</Text>
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Es. Congresso di settore a Milano, corso di formazione tecnica..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitButtonText}>Invia Richiesta</Text>
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
                <Text style={styles.historyType}>{formatDateIT(r.event_date)}</Text>
                <Text style={styles.historyDates}>
                  {r.start_time?.slice(0, 5)} → {r.end_time?.slice(0, 5)}
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
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
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
