import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Alert,
  Stack,
  Button,
  Card,
  CardContent
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useShifts } from '../hooks/useShifts';
import { useShiftUpdate } from '../hooks/useShiftUpdate';
import { MonthYearSelector } from '../components/MonthYearSelector';
import { ShiftsGrid } from '../components/ShiftsGrid';
import { ExportPlanningButton } from '../components/ExportPlanningButton';

export const PlanningPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [successMessage, setSuccessMessage] = useState(null);

  // Verify user is manager
  useEffect(() => {
    if (!user?.site_id) {
      return navigate('/dashboard');
    }
  }, [user, navigate]);

  // Fetch shifts data
  const { data, loading: loadingData, error: dataError } = useShifts(
    user?.site_id,
    month,
    year
  );

  // Mutation hook for saving shifts
  const { updateShift, loading: cellLoading, errors: cellErrors } = useShiftUpdate(
    user?.site_id,
    month,
    year
  );

  const handleShiftChange = async (employeeId, date, newShift) => {
    const success = await updateShift(employeeId, date, newShift);
    if (success) {
      setSuccessMessage(`Turno aggiornato per ${date}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  if (!user?.site_id) {
    return (
      <Container>
        <Alert severity="error">
          Accesso negato. Solo i manager con assegnazione store possono accedere a questa pagina.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ paddingY: '32px' }}>
      {/* Header */}
      <Box sx={{ marginBottom: '32px' }}>
        <Typography variant="h3" component="h1" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '8px' }}>
          📅 Planning Turni
        </Typography>
        <Typography variant="body1" color="textSecondary">
          {data?.site?.name || 'Caricamento...'} • Giugno 2026
        </Typography>
      </Box>

      {/* Success Message */}
      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ marginBottom: '16px' }}>
          {successMessage}
        </Alert>
      )}

      {/* Error Message */}
      {dataError && (
        <Alert severity="error" sx={{ marginBottom: '16px' }}>
          {dataError}
        </Alert>
      )}

      {/* Month/Year Selector */}
      <MonthYearSelector
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      {/* KPI Cards */}
      {data && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ marginBottom: '20px' }}>
          <Card sx={{ flex: 1, borderLeft: '4px solid #1E3A5F' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Dipendenti
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {data.metadata?.employee_count || 0}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Turni Compilati
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {Object.values(data.shifts_data || {}).reduce(
                  (sum, emp) => sum + Object.keys(emp).length,
                  0
                )}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1, borderLeft: '4px solid #7C3AED' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Giorni del Mese
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {new Date(year, month, 0).getDate()}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      {/* Shifts Grid */}
      <ShiftsGrid
        shiftsData={data?.shifts_data || {}}
        employees={data?.employees || []}
        month={month}
        year={year}
        loading={loadingData}
        error={dataError}
        onChange={handleShiftChange}
        cellLoading={cellLoading}
        cellErrors={cellErrors}
        readOnly={false}
      />

      {/* Export Button */}
      <Box sx={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <ExportPlanningButton
          siteId={user?.site_id}
          month={month}
          year={year}
          siteName={data?.site?.name || 'planning'}
        />
      </Box>

      {/* Info Card */}
      <Card sx={{ marginTop: '30px', backgroundColor: '#F5F2ED' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '8px' }}>
            💡 Come usare
          </Typography>
          <Typography variant="body2" component="div">
            <ul style={{ marginTop: '8px', marginBottom: '0' }}>
              <li>Seleziona il mese e l'anno</li>
              <li>Clicca su una cella per assegnare un turno (m, p, s, R)</li>
              <li>I turni si salvano automaticamente</li>
              <li>Puoi modificare turni retroattivamente</li>
              <li>Usa "Esporta" per scaricare come PDF o CSV</li>
            </ul>
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};
