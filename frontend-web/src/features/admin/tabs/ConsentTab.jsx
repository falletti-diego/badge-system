import React, { useState } from 'react';
import {
  Box, Typography, Alert, CircularProgress, Card, CardContent,
  Button, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, Paper, Chip,
} from '@mui/material';
import { useFetch } from '../components/useFetch';

export function ConsentTab() {
  const { data: response, loading, error: fetchError, reload } = useFetch('/api/v1/consent/admin/employee-consents');
  const [msg, setMsg] = useState(null);
  const data = response?.data || [];
  const summary = response?.summary || { total_employees: 0, consented: 0, pending: 0, consent_rate_percent: 0 };

  const handleNotifyPending = async () => {
    setMsg({ type: 'info', text: 'Notifica in corso...' });
    // Phase 2: Send email to pending employees
    // For now, just show a placeholder message
    setMsg({
      type: 'success',
      text: `${summary.pending} dipendenti in attesa verranno notificati (fase 2)`,
    });
    setTimeout(() => setMsg(null), 3000);
  };

  if (fetchError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{fetchError}</Alert>
      </Box>
    );
  }

  const consentedCount = summary.consented || 0;
  const pendingCount = summary.pending || 0;

  return (
    <Box>
      {msg && (
        <Alert
          severity={msg.type}
          onClose={() => setMsg(null)}
          sx={{ mb: 2 }}
        >
          {msg.text}
        </Alert>
      )}

      {/* Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Consensi GPS Totali
            </Typography>
            <Typography variant="h5">
              {summary.total_employees}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              ✅ Accettati
            </Typography>
            <Typography variant="h5" sx={{ color: 'success.main' }}>
              {consentedCount}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              ⏳ In Sospeso
            </Typography>
            <Typography variant="h5" sx={{ color: 'warning.main' }}>
              {pendingCount}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Tasso di Consenso
            </Typography>
            <Typography variant="h5" sx={{ color: 'info.main' }}>
              {summary.consent_rate_percent}%
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Action Buttons */}
      {pendingCount > 0 && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleNotifyPending}
            disabled={loading}
          >
            📧 Notifica Dipendenti In Sospeso ({pendingCount})
          </Button>
        </Box>
      )}

      {/* Consent Status Table */}
      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#F5F2ED' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Nome</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>GPS Consent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Data Accettazione</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Policy Version</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    Nessun dipendente trovato
                  </TableCell>
                </TableRow>
              ) : (
                data.map((emp) => (
                  <TableRow key={emp.id} sx={{ '&:hover': { backgroundColor: '#FAFAF8' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>{emp.name || '—'}</TableCell>
                    <TableCell>{emp.email}</TableCell>
                    <TableCell>
                      {emp.gps_consent_given ? (
                        <Chip label="✅ Accettato" size="small" color="success" />
                      ) : (
                        <Chip label="⏳ In sospeso" size="small" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.consent_accepted_at
                        ? new Date(emp.consent_accepted_at).toLocaleDateString('it-IT')
                        : '—'}
                    </TableCell>
                    <TableCell>{emp.privacy_policy_version || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
