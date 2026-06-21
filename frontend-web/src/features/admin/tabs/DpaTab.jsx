import React, { useState } from 'react';
import {
  Box, Typography, Alert, CircularProgress, Card, CardContent,
  Button, TextField, Table, TableBody, TableCell, TableHead,
  TableRow, TableContainer, Paper, Chip, Stack, Divider,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useFetch } from '../components/useFetch';
import apiClient from '../../../services/apiClient';

export function DpaTab() {
  const { data: rows, loading, error: fetchError, reload } = useFetch('/api/v1/admin/dpa-acknowledgements');
  const [acceptedBy, setAcceptedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // useFetch exposes data = res.data.data (the array). Endpoint sorts DESC so rows[0] is latest.
  const latest = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const isDpaSigned = latest !== null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedBy.trim() || acceptedBy.trim().length < 2) {
      setMsg({ type: 'error', text: 'Inserisci il nome completo del firmatario (almeno 2 caratteri).' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.post('/api/v1/admin/dpa-acknowledgement', {
        accepted_by: acceptedBy.trim(),
        notes: notes.trim() || null,
      });
      setMsg({ type: 'success', text: 'DPA registrato con successo. Audit trail salvato.' });
      setAcceptedBy('');
      setNotes('');
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  if (fetchError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{fetchError}</Alert>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Status Banner */}
      <Card variant="outlined" sx={{ borderColor: isDpaSigned ? 'success.main' : 'warning.main' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            {isDpaSigned ? (
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 36 }} />
            ) : (
              <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 36 }} />
            )}
            <Box>
              <Typography variant="h6" sx={{ color: isDpaSigned ? 'success.main' : 'warning.main' }}>
                {isDpaSigned ? 'DPA Firmato' : 'DPA Non Ancora Firmato'}
              </Typography>
              {isDpaSigned ? (
                <Typography variant="body2" color="text.secondary">
                  Firmato da <strong>{latest.accepted_by}</strong> il{' '}
                  {new Date(latest.accepted_at).toLocaleDateString('it-IT')} — versione {latest.dpa_version}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Compila il modulo sottostante dopo che il cliente ha firmato il documento DPA.
                </Typography>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Download Link */}
      <Box>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          href="https://badge.dataxiom.it/dpa-template-it"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ textTransform: 'none' }}
        >
          Scarica/Stampa Template DPA v2.0
        </Button>
        <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
          Apri il template, stampalo (o salva come PDF), fallo firmare al cliente, poi registra la firma qui sotto.
        </Typography>
      </Box>

      <Divider />

      {/* Form Registra Firma */}
      <Box>
        <Typography variant="h6" gutterBottom>Registra Firma DPA</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Inserisci il nome e titolo della persona che ha firmato il DPA per conto del cliente (es. "Mario Rossi - Direttore HR").
        </Typography>

        {msg && (
          <Alert
            severity={msg.type}
            onClose={() => setMsg(null)}
            sx={{ mb: 2 }}
          >
            {msg.text}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2} sx={{ maxWidth: 500 }}>
            <TextField
              label="Nome e Titolo Firmatario *"
              value={acceptedBy}
              onChange={(e) => setAcceptedBy(e.target.value)}
              placeholder="Es. Mario Rossi - Direttore HR"
              disabled={saving}
              inputProps={{ minLength: 2, maxLength: 200 }}
              required
              fullWidth
            />
            <TextField
              label="Note (opzionale)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. 'firmato tramite email certificata' oppure 'copia cartacea archiviata'"
              disabled={saving}
              multiline
              rows={2}
              fullWidth
            />
            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !acceptedBy.trim()}
                sx={{ textTransform: 'none' }}
              >
                {saving ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                {saving ? 'Salvataggio...' : 'Registra Firma DPA'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Box>

      <Divider />

      {/* Storico Acknowledgements */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Storico Firme DPA{' '}
          {Array.isArray(rows) && rows.length > 0 && (
            <Chip label={`${rows.length} record`} size="small" sx={{ ml: 1 }} />
          )}
        </Typography>

        {loading ? (
          <CircularProgress />
        ) : !Array.isArray(rows) || rows.length === 0 ? (
          <Alert severity="info">Nessun DPA registrato. Compila il modulo sopra dopo la firma del cliente.</Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ backgroundColor: '#F5F2ED' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Firmatario</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Versione DPA</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} sx={{ '&:hover': { backgroundColor: '#FAFAF8' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>{row.accepted_by}</TableCell>
                    <TableCell>
                      {new Date(row.accepted_at).toLocaleDateString('it-IT', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <Chip label={`v${row.dpa_version}`} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                      {row.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Stack>
  );
}
