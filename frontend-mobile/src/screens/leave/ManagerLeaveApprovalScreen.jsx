import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { formatDateIT } from '../../utils/dateUtils';
import { PendingLeaveContext } from '../../navigation/RootNavigator';

const LEAVE_LABELS = {
  FERIE_1: 'Ferie ordinarie',
  FERIE_2: 'Ex-festività',
  FERIE_3: 'Permessi ROL',
  MALATTIA: 'Malattia',
};

export default function ManagerLeaveApprovalScreen() {
  const { setPendingCount } = useContext(PendingLeaveContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(null); // id of request being actioned

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.LEAVES_PENDING);
      const data = res.data.data || [];
      setRequests(data);
      setPendingCount(data.length);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setPendingCount]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAction = async (id, status, employeeName) => {
    const label = status === 'APPROVED' ? 'approvare' : 'rifiutare';
    Alert.alert(
      `Conferma`,
      `Vuoi ${label} la richiesta di ${employeeName}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: status === 'APPROVED' ? 'Approva' : 'Rifiuta',
          style: status === 'APPROVED' ? 'default' : 'destructive',
          onPress: async () => {
            setActioning(id);
            try {
              await apiClient.put(`/api/v1/leave/${id}/approve`, { status });
              load();
            } catch (err) {
              const msg = err.response?.data?.message || err.message || 'Errore';
              Alert.alert('Errore', msg);
            } finally {
              setActioning(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Approvazione Ferie</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#1E3A5F" style={{ marginTop: 48 }} size="large" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1E3A5F" />}
        >
          {requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>Nessuna richiesta in attesa</Text>
              <Text style={styles.emptyText}>Tira giù per aggiornare</Text>
            </View>
          ) : (
            <>
              <Text style={styles.countLabel}>{requests.length} richiesta{requests.length !== 1 ? 'e' : ''} in attesa</Text>
              {requests.map(r => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.employeeName}>{r.employee_name}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>{LEAVE_LABELS[r.leave_type] ?? r.leave_type}</Text>
                    </View>
                  </View>

                  <Text style={styles.dates}>
                    {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                    {'  ·  '}{r.num_days} giorno{r.num_days !== 1 ? 'i' : ''}
                  </Text>

                  {r.motivation ? (
                    <Text style={styles.motivation}>"{r.motivation}"</Text>
                  ) : null}

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, actioning === r.id && styles.btnDisabled]}
                      onPress={() => handleAction(r.id, 'REJECTED', r.employee_name)}
                      disabled={actioning === r.id}
                    >
                      {actioning === r.id
                        ? <ActivityIndicator color="#991B1B" size="small" />
                        : <Text style={styles.rejectText}>✕  Rifiuta</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.approveBtn, actioning === r.id && styles.btnDisabled]}
                      onPress={() => handleAction(r.id, 'APPROVED', r.employee_name)}
                      disabled={actioning === r.id}
                    >
                      {actioning === r.id
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Text style={styles.approveText}>✓  Approva</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48 },
  countLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  employeeName: { fontSize: 16, fontWeight: '700', color: '#1F2937', flex: 1, marginRight: 8 },
  typeBadge: {
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  typeText: { fontSize: 12, fontWeight: '600', color: '#1E3A5F' },
  dates: { fontSize: 14, color: '#374151', marginBottom: 4 },
  motivation: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 8, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rejectBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#FCA5A5', alignItems: 'center',
  },
  approveBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#1E3A5F', alignItems: 'center',
  },
  rejectText: { color: '#991B1B', fontWeight: '600', fontSize: 14 },
  approveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
