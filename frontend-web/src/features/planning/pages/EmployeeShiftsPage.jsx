import React, { useState } from 'react';
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
  Stack,
  Chip,
  AppBar,
  Toolbar,
  Button,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useMySchedule } from '../hooks/useMySchedule';
import authService from '../../../services/authService';

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

  console.log('🚀 EmployeeShiftsPage mounted!', { user });

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  // Fetch employee's schedule from API
  const { data, loading, error } = useMySchedule(month, year);

  if (!user?.employee_id) {
    return (
      <div className="min-h-screen bg-linen">
        <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>📆 I Miei Turni</h1>
            <Button color="inherit" onClick={handleLogout} sx={{ textTransform: 'none', fontSize: '14px' }}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>
        <Container>
          <Alert severity="error" sx={{ marginTop: '20px' }}>
            Accesso negato. Solo i dipendenti possono accedere a questa pagina.
          </Alert>
        </Container>
      </div>
    );
  }

  // Extract shifts from API response
  const shiftsData = data?.shifts_data || {};
  const shiftsArray = Object.entries(shiftsData)
    .map(([date, shift]) => ({ date, shift }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('it-IT', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-linen">
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>📆 I Miei Turni</h1>
          <Box sx={{ display: 'flex', gap: '12px' }}>
            <Button
              color="inherit"
              onClick={() => navigate('/dashboard')}
              sx={{ textTransform: 'none', fontSize: '14px' }}
            >
              ← Back to Dashboard
            </Button>
            <Button
              color="inherit"
              onClick={handleLogout}
              sx={{ textTransform: 'none', fontSize: '14px' }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ paddingY: '32px' }}>
        {/* Header */}
        <Box sx={{ marginBottom: '32px' }}>
          <Typography variant="h3" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '8px' }}>
            📆 I Miei Turni
          </Typography>
          <Typography variant="body1" color="textSecondary">
            {user?.name || 'Dipendente'} • {monthLabel}
          </Typography>
        </Box>

        {/* Month/Year Selector */}
        <Box sx={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            sx={{ width: '150px' }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <MenuItem key={i + 1} value={i + 1}>
                {new Date(2026, i, 1).toLocaleString('it-IT', { month: 'long' })}
              </MenuItem>
            ))}
          </Select>
          <Select value={year} onChange={(e) => setYear(e.target.value)} sx={{ width: '100px' }}>
            <MenuItem value={2026}>2026</MenuItem>
            <MenuItem value={2027}>2027</MenuItem>
          </Select>
        </Box>

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ marginBottom: '20px' }}>
            {error.message}
          </Alert>
        )}

        {/* Summary Cards (only show if not loading) */}
        {!loading && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ marginBottom: '20px' }}>
            <Card sx={{ flex: 1, borderLeft: '4px solid #2D7049' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Turni Assegnati
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {shiftsArray.length}/{daysInMonth}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Giorni Liberi
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {Math.max(0, daysInMonth - shiftsArray.length)}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* Shifts List (only show if not loading) */}
        {!loading && (shiftsArray.length === 0 ? (
          <Card sx={{ backgroundColor: '#F5F2ED' }}>
            <CardContent sx={{ textAlign: 'center', padding: '40px' }}>
              <Typography variant="body1" color="textSecondary">
                Nessun turno assegnato per {monthLabel}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Box sx={{ p: 0 }}>
              {shiftsArray.map(({ date, shift }, idx) => {
                const shiftInfo = SHIFT_ICONS[shift] || { label: shift, color: '#999999' };
                const dateObj = new Date(date);
                const dateStr = dateObj.toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                });

                return (
                  <Box
                    key={date}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 16px',
                      borderBottom: idx < shiftsArray.length - 1 ? '1px solid #E5E7EB' : 'none',
                      '&:hover': {
                        backgroundColor: '#F9F8F6'
                      }
                    }}
                  >
                    <Typography variant="body1" sx={{ fontWeight: '500', color: '#2A2520' }}>
                      {dateStr}
                    </Typography>
                    <Box
                      sx={{
                        backgroundColor: shiftInfo.color,
                        color: '#FFFFFF',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        minWidth: '80px',
                        textAlign: 'center'
                      }}
                    >
                      {shiftInfo.label}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Card>
        ))}

        {/* Info Card */}
        <Card sx={{ marginTop: '30px', backgroundColor: '#F5F2ED' }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '12px' }}>
              💡 Legenda Turni
            </Typography>
            <Box sx={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {Object.entries(SHIFT_ICONS).map(([key, info]) => (
                <Chip
                  key={key}
                  label={info.label}
                  sx={{
                    backgroundColor: info.color,
                    color: '#FFFFFF',
                    fontWeight: '600',
                    fontSize: '13px'
                  }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
};
