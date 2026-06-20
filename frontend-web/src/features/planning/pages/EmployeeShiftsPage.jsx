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
import { useIllness } from '../../illness/hooks/useIllness';
import { useLeave } from '../../leave/hooks/useLeave';
import authService from '../../../services/authService';
import { NotificationBell } from '../../notifications/components/NotificationBell';

const SHIFT_ICONS = {
  'm': { emoji: '🌅', label: 'Mattino', color: '#1E3A5F' },
  'p': { emoji: '☀️', label: 'Pomeriggio', color: '#B45309' },
  's': { emoji: '🌙', label: 'Sera', color: '#7C3AED' },
  'R': { emoji: '❌', label: 'Riposo', color: '#6B7280' }
};

export const EmployeeShiftsPage = () => {
  const navigate = useNavigate();
  const { user, loading: userLoading } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [illnesses, setIllnesses] = useState([]);
  const [loadingIllnesses, setLoadingIllnesses] = useState(false);
  const [approvedLeaves, setApprovedLeaves] = useState([]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  // Fetch employee's schedule from API
  const { data, loading, error } = useMySchedule(month, year);
  const { getIllnessesByDateRange } = useIllness();
  const { getApprovedRequests } = useLeave();

  // Load illnesses for the selected month/year
  useEffect(() => {
    const loadIllnesses = async () => {
      try {
        setLoadingIllnesses(true);
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0);
        const endDay = `${year}-${String(month).padStart(2, '0')}-${lastDay.getDate()}`;

        const data = await getIllnessesByDateRange(firstDay, endDay);
        setIllnesses(data || []);
      } catch (err) {
        console.error('Errore nel caricamento delle malattie:', err);
      } finally {
        setLoadingIllnesses(false);
      }
    };

    loadIllnesses();
  }, [month, year, getIllnessesByDateRange]);

  // Load approved leave requests for this employee
  useEffect(() => {
    (async () => {
      try {
        const leaves = await getApprovedRequests();
        setApprovedLeaves(leaves || []);
      } catch (err) {
        console.error('Errore nel caricamento delle ferie approvate:', err);
      }
    })();
  }, [getApprovedRequests]);

  if (userLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

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

  const shiftsData = data?.shifts_data || {};
  const daysInMonth = new Date(year, month, 0).getDate();

  // Helper function: check if date has illness
  const isDateIll = (dateStr) => {
    return illnesses.some((illness) => {
      const start = new Date(illness.start_date).toISOString().split('T')[0];
      const end = new Date(illness.end_date).toISOString().split('T')[0];
      return dateStr >= start && dateStr <= end && !illness.cancelled_at;
    });
  };

  // Helper function: check if date is an approved leave day
  const isDateLeave = (dateStr) => {
    return approvedLeaves.some((l) => {
      const start = new Date(l.start_date).toISOString().split('T')[0];
      const end = new Date(l.end_date).toISOString().split('T')[0];
      return dateStr >= start && dateStr <= end;
    });
  };

  // Generate ALL days of the month — shift is null when not yet assigned
  const shiftsArray = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date: dateStr, shift: shiftsData[dateStr] || null };
  });

  const illnessCount = shiftsArray.filter(({ date }) => isDateIll(date)).length;
  const leaveCount = shiftsArray.filter(({ date }) => !isDateIll(date) && isDateLeave(date)).length;
  const assignedCount = shiftsArray.filter(({ date, shift }) => shift !== null && !isDateIll(date) && !isDateLeave(date)).length;
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
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <NotificationBell enabled={true} />
            <Button
              color="inherit"
              onClick={() => navigate('/dashboard')}
              sx={{ textTransform: 'none', fontSize: '14px' }}
            >
              ← Dashboard
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
                  {assignedCount}/{daysInMonth - illnessCount - leaveCount}
                </Typography>
              </CardContent>
            </Card>

            {illnessCount > 0 && (
              <Card sx={{ flex: 1, borderLeft: '4px solid #DC2626' }}>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Giorni di Malattia
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#DC2626' }}>
                    {illnessCount}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {leaveCount > 0 && (
              <Card sx={{ flex: 1, borderLeft: '4px solid #0EA5E9' }}>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Giorni di Ferie
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#0EA5E9' }}>
                    {leaveCount}
                  </Typography>
                </CardContent>
              </Card>
            )}

            <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Giorni Liberi
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {daysInMonth - assignedCount - illnessCount - leaveCount}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* Shifts List — all days shown, unassigned days appear as "—" */}
        {!loading && (
          <Card>
            <Box sx={{ p: 0 }}>
              {shiftsArray.map(({ date, shift }, idx) => {
                const shiftInfo = shift ? SHIFT_ICONS[shift] : null;
                const dateObj = new Date(date + 'T00:00:00');
                const dateLabel = dateObj.toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                });
                const isWeekend = [0, 6].includes(dateObj.getDay());
                const ill = isDateIll(date);
                const leave = !ill && isDateLeave(date);

                return (
                  <Box
                    key={date}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: idx < shiftsArray.length - 1 ? '1px solid #E5E7EB' : 'none',
                      backgroundColor: ill ? 'rgba(220, 38, 38, 0.08)' : leave ? 'rgba(14, 165, 233, 0.08)' : isWeekend ? '#FAFAF8' : 'transparent',
                      '&:hover': { backgroundColor: ill ? 'rgba(220, 38, 38, 0.12)' : leave ? 'rgba(14, 165, 233, 0.12)' : '#F9F8F6' }
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: (ill || leave) ? '600' : isWeekend ? '400' : '500',
                        color: ill ? '#DC2626' : leave ? '#0284C7' : isWeekend ? '#9CA3AF' : '#2A2520',
                        textTransform: 'capitalize'
                      }}
                    >
                      {dateLabel}
                    </Typography>
                    {ill ? (
                      <Box
                        sx={{
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          padding: '3px 12px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: '600',
                          minWidth: '90px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        ⚕️ Malattia
                      </Box>
                    ) : leave ? (
                      <Box
                        sx={{
                          backgroundColor: '#0EA5E9',
                          color: '#FFFFFF',
                          padding: '3px 12px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: '600',
                          minWidth: '90px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        🏖️ Ferie
                      </Box>
                    ) : shiftInfo ? (
                      <Box
                        sx={{
                          backgroundColor: shiftInfo.color,
                          color: '#FFFFFF',
                          padding: '3px 12px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: '600',
                          minWidth: '90px',
                          textAlign: 'center'
                        }}
                      >
                        {shiftInfo.label}
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          color: '#D1D5DB',
                          fontSize: '13px',
                          minWidth: '90px',
                          textAlign: 'center'
                        }}
                      >
                        —
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Card>
        )}

        {/* Info Card */}
        <Card sx={{ marginTop: '30px', backgroundColor: '#F5F2ED' }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '12px' }}>
              💡 Legenda
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
              <Chip
                label="Malattia"
                sx={{
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              />
              <Chip
                label="Ferie"
                sx={{
                  backgroundColor: '#0EA5E9',
                  color: '#FFFFFF',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
};
