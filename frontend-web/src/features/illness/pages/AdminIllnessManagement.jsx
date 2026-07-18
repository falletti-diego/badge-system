import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
} from '@mui/material';
import apiClient from '../../../services/apiClient';

export const AdminIllnessManagement = () => {
  const navigate = useNavigate();
  const [illnesses, setIllnesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const successMessageTimeoutRef = useRef(null);

  useEffect(() => {
    loadIllnesses();
  }, []);

  useEffect(() => {
    return () => {
      if (successMessageTimeoutRef.current) clearTimeout(successMessageTimeoutRef.current);
    };
  }, []);

  const loadIllnesses = async () => {
    try {
      const response = await apiClient.get('/api/v1/illnesses/admin');
      setIllnesses(response.data.data || []);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Errore nel caricamento delle malattie');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (illnessId) => {
    if (!window.confirm('Sei sicuro di voler cancellare questa comunicazione di malattia?')) {
      return;
    }

    try {
      await apiClient.delete(`/api/v1/illnesses/${illnessId}`, {
        data: { cancellation_reason: 'Cancellata da admin' },
      });

      setSuccessMessage('Comunicazione malattia cancellata');
      setErrorMessage(null);
      await loadIllnesses();
      if (successMessageTimeoutRef.current) clearTimeout(successMessageTimeoutRef.current);
      successMessageTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Errore nella cancellazione');
    }
  };

  const filteredIllnesses =
    tabValue === 0 ? illnesses.filter((i) => !i.cancelled_at) : illnesses.filter((i) => i.cancelled_at);

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4, px: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  bgcolor: '#DC2626',
                  transform: 'rotate(45deg)',
                }}
              />
              <Typography variant="h2" sx={{ fontSize: '2.5rem', fontWeight: 700 }}>
                Gestione Malattie
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ color: '#666' }}>
              Visualizza e gestisci le comunicazioni di malattia
            </Typography>
          </Box>
          <Button
            variant="text"
            onClick={() => navigate('/dashboard')}
            sx={{ fontWeight: 600, color: '#666' }}
          >
            Torna alla Dashboard
          </Button>
        </Box>

        {/* Alerts */}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {successMessage}
          </Alert>
        )}
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs
            value={tabValue}
            onChange={(e, newValue) => setTabValue(newValue)}
            sx={{ backgroundColor: '#fef2f2' }}
          >
            <Tab label="Attive" />
            <Tab label="Cancellate" />
          </Tabs>
        </Paper>

        {/* Table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredIllnesses.length === 0 ? (
          <Alert severity="info">
            {tabValue === 0 ? 'Nessuna comunicazione di malattia attiva' : 'Nessuna comunicazione cancellata'}
          </Alert>
        ) : (
          <Paper sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#fef2f2' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#111' }}>Dipendente</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#111' }}>Inizio</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#111' }}>Fine</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#111' }}>
                    Giorni
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#111' }}>Motivo</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#111' }}>Comunicata</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#111' }}>
                    Azioni
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredIllnesses.map((illness) => {
                  const start = new Date(illness.start_date);
                  const end = new Date(illness.end_date);
                  const numDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                  const created = new Date(illness.created_at);

                  return (
                    <TableRow key={illness.id} hover>
                      <TableCell sx={{ fontWeight: 600, color: '#111' }}>
                        {illness.employee_name}
                      </TableCell>
                      <TableCell>{start.toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>{end.toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={numDays}
                          size="small"
                          sx={{ backgroundColor: '#fee2e2', color: '#DC2626', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.9rem', color: '#666' }}>
                        {illness.reason || '—'}
                      </TableCell>
                      <TableCell>{created.toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="center">
                        {illness.certificate_url && (
                          <Button
                            size="small"
                            variant="text"
                            href={illness.certificate_url}
                            target="_blank"
                            sx={{ color: '#DC2626' }}
                          >
                            Cert.
                          </Button>
                        )}
                        {!illness.cancelled_at && (
                          <Button
                            size="small"
                            variant="text"
                            color="error"
                            onClick={() => handleDelete(illness.id)}
                          >
                            Cancella
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </Container>
  );
};
