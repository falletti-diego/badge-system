import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Paper, Card, CardContent, Button, TextField,
  Snackbar, Alert, Table, TableHead, TableBody, TableRow, TableCell, Chip,
  Stack, CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useEvents } from '../hooks/useEvents';

const STATUS_COLORS = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minEventDateISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const EmployeeEventRequest = () => {
  const navigate = useNavigate();
  const { createRequest, getMyRequests, loading, error, clearError } = useEvents();

  const [formData, setFormData] = useState({
    event_date: todayISO(),
    start_time: '08:00',
    end_time: '18:00',
    description: '',
  });

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await getMyRequests();
      setRequests(data || []);
    } catch (err) {
      // handled by hook
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const isFormValid =
    formData.event_date &&
    formData.start_time &&
    formData.end_time &&
    formData.end_time > formData.start_time &&
    formData.description.trim().length >= 10;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    try {
      await createRequest(formData.event_date, formData.start_time, formData.end_time, formData.description.trim());
      setSuccessMessage('Richiesta evento/training inviata con successo!');
      setFormData({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: '' });
      setTimeout(loadRequests, 500);
    } catch (err) {
      // Error is handled by useEvents hook
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4, px: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
          <Box>
            <Typography variant="h2" sx={{ mb: 1 }}>Richiedi Evento/Training</Typography>
            <Typography variant="body1" sx={{ color: '#6B625A' }}>
              Giustifica una giornata trascorsa a un evento, congresso o attività di training
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/dashboard')}
            disabled={loading}
            sx={{ borderColor: '#374151', color: '#374151', fontWeight: 600, mt: 0.5 }}
          >
            Dashboard
          </Button>
        </Box>

        <Card sx={{ mb: 6, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
          <CardContent sx={{ p: 3 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Data evento"
                    type="date"
                    value={formData.event_date}
                    onChange={handleChange('event_date')}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: minEventDateISO() }}
                    sx={{ flex: 1, minWidth: 160 }}
                  />
                  <TextField
                    label="Ora inizio"
                    type="time"
                    value={formData.start_time}
                    onChange={handleChange('start_time')}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                  <TextField
                    label="Ora fine"
                    type="time"
                    value={formData.end_time}
                    onChange={handleChange('end_time')}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                </Box>

                <TextField
                  label="Descrizione evento"
                  multiline
                  rows={4}
                  value={formData.description}
                  onChange={handleChange('description')}
                  placeholder="Es. Congresso di settore a Milano, corso di formazione tecnica..."
                  helperText={`${formData.description.length}/500 (minimo 10 caratteri)`}
                  fullWidth
                  inputProps={{ maxLength: 500 }}
                />

                <Stack direction="row" spacing={2} justifyContent="flex-start">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={!isFormValid || loading}
                    sx={{
                      backgroundColor: '#2D7049',
                      '&:hover': { backgroundColor: '#215a37' },
                      '&:disabled': { backgroundColor: '#ccc' },
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Invia Richiesta'}
                  </Button>
                </Stack>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Box sx={{ mt: 6 }}>
          <Typography variant="h3" sx={{ mb: 3, fontWeight: 600 }}>Le Tue Richieste</Typography>

          {requestsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : requests.length === 0 ? (
            <Alert severity="info">Non hai ancora inoltrato richieste di evento/training</Alert>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Orario</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Descrizione</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell>{new Date(req.event_date).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>{req.start_time?.slice(0, 5)} - {req.end_time?.slice(0, 5)}</TableCell>
                      <TableCell>{req.description}</TableCell>
                      <TableCell>
                        <Chip label={req.status} size="small" color={STATUS_COLORS[req.status]} variant="filled" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </Box>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Container>
  );
};
