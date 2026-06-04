import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Stack,
  Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { MonthYearSelector } from '../components/MonthYearSelector';
import apiClient from '../../../services/apiClient';

const SHIFT_ICONS = {
  'm': { emoji: '🌅', label: 'Mattino', color: '#1E3A5F' },
  'p': { emoji: '☀️', label: 'Pomeriggio', color: '#B45309' },
  's': { emoji: '🌙', label: 'Sera', color: '#7C3AED' },
  'R': { emoji: '❌', label: 'Riposo', color: '#6B7280' }
};

export const EmployeeShiftsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Verify user is employee
  useEffect(() => {
    if (user?.role !== 'employee') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Fetch employee's shifts
  useEffect(() => {
    if (!user?.employee_id) return;

    const fetchShifts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/api/shifts/my-schedule', {
          params: { month, year }
        });
        setShifts(response.data.data?.shifts_data || {});
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch shifts');
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [user?.employee_id, month, year]);

  if (user?.role !== 'employee') {
    return (
      <Container>
        <Alert severity="error">
          Accesso negato. Solo i dipendenti possono accedere a questa pagina.
        </Alert>
      </Container>
    );
  }

  const shiftsArray = Object.entries(shifts)
    .map(([date, shift]) => ({ date, shift }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const monthLabel = new Date(year, month - 1, 1).toLocaleString('it-IT', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <Container maxWidth="md" sx={{ paddingY: '32px' }}>
      {/* Header */}
      <Box sx={{ marginBottom: '32px' }}>
        <Typography variant="h3" component="h1" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '8px' }}>
          📆 I Miei Turni
        </Typography>
        <Typography variant="body1" color="textSecondary">
          {user?.name || 'Dipendente'}
        </Typography>
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ marginBottom: '16px' }}>
          {error}
        </Alert>
      )}

      {/* Month/Year Selector */}
      <MonthYearSelector
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      {/* Summary Cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ marginBottom: '20px' }}>
        <Card sx={{ flex: 1, borderLeft: '4px solid #2D7049' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Turni Assegnati
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {shiftsArray.length}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Giorni Liberi
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {Math.max(0, new Date(year, month, 0).getDate() - shiftsArray.length)}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Shifts List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </Box>
      ) : shiftsArray.length === 0 ? (
        <Card sx={{ backgroundColor: '#F5F2ED' }}>
          <CardContent sx={{ textAlign: 'center', padding: '40px' }}>
            <Typography variant="body1" color="textSecondary">
              Nessun turno assegnato per {monthLabel}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <List>
            {shiftsArray.map(({ date, shift }, idx) => {
              const shiftInfo = SHIFT_ICONS[shift] || { emoji: '?', label: shift, color: '#999999' };
              const dateObj = new Date(date);
              const dateStr = dateObj.toLocaleDateString('it-IT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              });

              return (
                <ListItem key={date} divider={idx < shiftsArray.length - 1}>
                  <ListItemIcon>
                    <Box
                      sx={{
                        fontSize: '24px',
                        backgroundColor: shiftInfo.color,
                        color: '#FFFFFF',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        minWidth: '50px'
                      }}
                    >
                      {shiftInfo.emoji}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={dateStr}
                    secondary={shiftInfo.label}
                    primaryTypographyProps={{ sx: { fontWeight: '500' } }}
                  />
                </ListItem>
              );
            })}
          </List>
        </Card>
      )}

      {/* Info Card */}
      <Card sx={{ marginTop: '30px', backgroundColor: '#F5F2ED' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '8px' }}>
            💡 Legenda Turni
          </Typography>
          <Stack spacing={1}>
            {Object.entries(SHIFT_ICONS).map(([key, info]) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Chip
                  icon={<span>{info.emoji}</span>}
                  label={info.label}
                  sx={{
                    backgroundColor: info.color,
                    color: '#FFFFFF',
                    fontWeight: 'bold'
                  }}
                />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
};
