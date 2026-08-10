import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Button, Typography, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress,
} from '@mui/material';
import { NavBar } from '../components/NavBar';
import apiClient from '../services/apiClient';

const MONTH_NAMES = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];

function formatHours(h) {
  if (h === 0) return '0h';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

const MySummaryPage = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [month] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [year] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);

  const isCurrentOrFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/v1/presences/my-summary?month=${month}&year=${year}`);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nel caricamento del cartellino');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleSign = async () => {
    setSigning(true);
    try {
      await apiClient.post('/api/v1/timesheet/sign', { month, year });
      await fetchSummary();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nella firma del cartellino');
    } finally {
      setSigning(false);
    }
  };

  const signature = data?.signature;

  return (
    <div className="min-h-screen bg-linen">
      <NavBar title="Badge System">
        <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none' }}>📋 Presenze</Button>
      </NavBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F', mb: 2 }}>
          📄 Il Mio Cartellino — {MONTH_NAMES[month - 1]} {year}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!signature && (
          <Alert severity="info" sx={{ mb: 2 }}>Da firmare</Alert>
        )}
        {signature?.status === 'signed' && (
          <Alert severity="success" sx={{ mb: 2 }}>✅ Firmato il {new Date(signature.signed_at).toLocaleDateString('it-IT')}</Alert>
        )}
        {signature?.status === 'invalidated' && (
          <Alert severity="warning" sx={{ mb: 2 }}>⚠️ Modificato dopo la firma — richiede nuova firma</Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        ) : data && (
          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Giorni','Ore Totali','Ore Ord.','Ore Straord.','Buoni Pasto'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{data.giorni_presenti}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{formatHours(data.ore_totali)}</TableCell>
                  <TableCell>{formatHours(data.ore_ordinarie)}</TableCell>
                  <TableCell>{formatHours(data.ore_straordinarie)}</TableCell>
                  <TableCell>{data.buoni_pasto}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {(!signature || signature.status === 'invalidated') && (
          <Button
            variant="contained"
            disabled={isCurrentOrFutureMonth || signing || !data}
            onClick={handleSign}
            sx={{ backgroundColor: '#1E3A5F' }}
          >
            {signing ? 'Invio...' : 'Approvo il cartellino'}
          </Button>
        )}
      </Container>
    </div>
  );
};

export default MySummaryPage;
