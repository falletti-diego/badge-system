/**
 * SummaryPage — Monthly work hours & meal vouchers summary
 * Accessible to admin, manager, viewer
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, AppBar, Toolbar, Button, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Alert, Chip, IconButton, Tooltip,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import DownloadIcon from '@mui/icons-material/Download';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

const MONTH_NAMES = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];

function formatHours(h) {
  if (h === 0) return '0h';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function exportCsv(data, month, year) {
  const monthName = MONTH_NAMES[month - 1].toLowerCase();
  const headers = ['Nome','Matricola','Giorni Presenti','Ore Totali','Ore Ordinarie','Ore Straordinarie','Buoni Pasto','Presenze Aperte'];
  const rows = data.employees.map(e => [
    e.name || '',
    e.matricola || '',
    e.giorni_presenti,
    e.ore_totali,
    e.ore_ordinarie,
    e.ore_straordinarie,
    e.buoni_pasto,
    e.presenze_aperte,
  ]);

  const lines = [headers.join(';'), ...rows.map(r => r.join(';'))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `riepilogo_${monthName}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const SummaryPage = () => {
  const navigate = useNavigate();
  const userRole = authService.getUserRole();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/presences/summary?month=${month}&year=${year}`);
      const summary = res.data.data;
      // Validate response structure
      if (!summary || !Array.isArray(summary.employees) || !summary.totals) {
        throw new Error('Invalid response structure from server');
      }
      setData(summary);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nel caricamento del riepilogo');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="min-h-screen bg-linen">
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>Badge System</h1>
          <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
              📋 Presenze
            </Button>
            {(userRole === 'manager' || userRole === 'admin') && (
              <Button color="inherit" onClick={() => navigate('/planning')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                📅 Planning
              </Button>
            )}
            {(userRole === 'manager' || userRole === 'admin') && (
              <Button color="inherit" onClick={() => navigate('/corrections')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                ✏️ Correzioni
              </Button>
            )}
            {userRole === 'admin' && (
              <Button color="inherit" onClick={() => navigate('/admin')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                ⚙️ Admin
              </Button>
            )}
            <Button color="inherit" onClick={async () => { await authService.logout(); navigate('/login'); }} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
              Esci
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F' }}>
            📊 Riepilogo Mensile
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={prevMonth} size="small"><ArrowBackIosNewIcon fontSize="small" /></IconButton>
            <Typography sx={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
              {MONTH_NAMES[month - 1]} {year}
            </Typography>
            <IconButton onClick={nextMonth} size="small"><ArrowForwardIosIcon fontSize="small" /></IconButton>

            <Tooltip title="Esporta CSV">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  disabled={!data || data.employees.length === 0}
                  onClick={() => exportCsv(data, month, year)}
                  sx={{ ml: 2, borderColor: '#1E3A5F', color: '#1E3A5F', textTransform: 'none' }}
                >
                  CSV
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {/* Info chip */}
        {data && (
          <Box sx={{ mb: 2 }}>
            <Chip
              label={`Soglia buono pasto: ${data.meal_voucher_threshold_hours}h`}
              size="small"
              sx={{ backgroundColor: '#EEF6F1', color: '#2D7049', fontWeight: 500 }}
            />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: '#F5F2ED' }}>
                <TableRow>
                  {['Nome','Matricola','Giorni','Ore Totali','Ore Ord.','Ore Straord.','Buoni Pasto','⚠️ Aperte'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, color: '#2A2520' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {!data || data.employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ color: '#6B625A', py: 4 }}>
                      Nessun dipendente trovato per {MONTH_NAMES[month - 1]} {year}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {data.employees.map(emp => (
                      <TableRow key={emp.id} sx={{ '&:hover': { backgroundColor: '#FAFAF8' } }}>
                        <TableCell sx={{ fontWeight: 500 }}>{emp.name || '—'}</TableCell>
                        <TableCell sx={{ color: '#6B625A' }}>{emp.matricola || '—'}</TableCell>
                        <TableCell>{emp.giorni_presenti}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{formatHours(emp.ore_totali)}</TableCell>
                        <TableCell>{formatHours(emp.ore_ordinarie)}</TableCell>
                        <TableCell sx={{ color: emp.ore_straordinarie > 0 ? '#B45309' : 'inherit' }}>
                          {formatHours(emp.ore_straordinarie)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={emp.buoni_pasto}
                            size="small"
                            sx={{
                              backgroundColor: emp.buoni_pasto > 0 ? '#EEF6F1' : '#F5F2ED',
                              color: emp.buoni_pasto > 0 ? '#2D7049' : '#6B625A',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {emp.presenze_aperte > 0 ? (
                            <Chip label={emp.presenze_aperte} size="small" color="warning" sx={{ fontWeight: 600 }} />
                          ) : (
                            <span style={{ color: '#6B625A' }}>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Totals row */}
                    <TableRow sx={{ backgroundColor: '#F5F2ED', borderTop: '2px solid #E5E0D8' }}>
                      <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Totale</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{data.totals.giorni_presenti}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatHours(data.totals.ore_totali)}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatHours(data.totals.ore_ordinarie)}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatHours(data.totals.ore_straordinarie)}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{data.totals.buoni_pasto}</TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </div>
  );
};

export default SummaryPage;
