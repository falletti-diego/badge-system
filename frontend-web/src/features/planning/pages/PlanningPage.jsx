import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  AppBar,
  Toolbar,
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useShifts } from '../hooks/useShifts';
import { useShiftUpdate } from '../hooks/useShiftUpdate';
import { useLeave } from '../../leave/hooks/useLeave';
import { useIllness } from '../../illness/hooks/useIllness';
import { ManagerIllnessModal } from '../../illness/components/ManagerIllnessModal';
import authService from '../../../services/authService';

const SHIFT_COLORS = {
  'm': { bg: '#1E3A5F', label: 'Mattino' },
  'p': { bg: '#B45309', label: 'Pomeriggio' },
  's': { bg: '#7C3AED', label: 'Sera' },
  'R': { bg: '#6B7280', label: 'Riposo' }
};

export const PlanningPage = () => {
  const navigate = useNavigate();
  const { user, loading: userLoading } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState({}); // Local state for edits
  const [lastSavedShifts, setLastSavedShifts] = useState({}); // Track last saved state
  const [isSaving, setIsSaving] = useState(false); // Track save loading state
  const [saveError, setSaveError] = useState(null); // Track save errors
  const [approvedLeaves, setApprovedLeaves] = useState([]); // Approved leave requests
  const [loadingLeaves, setLoadingLeaves] = useState(false); // Leave loading state
  const [illnesses, setIllnesses] = useState([]); // Reported illnesses
  const [loadingIllnesses, setLoadingIllnesses] = useState(false); // Illness loading state
  const [selectedIllness, setSelectedIllness] = useState(null); // For modal
  const [illnessModalOpen, setIllnessModalOpen] = useState(false); // Modal state

  const { getApprovedRequests } = useLeave();
  const { getIllnessesByDateRange } = useIllness();

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  const { data, loading, error } = useShifts(user?.site_id, month, year);
  const { saveShifts } = useShiftUpdate(user?.site_id, month, year);

  // Load approved leaves
  useEffect(() => {
    const loadLeaves = async () => {
      setLoadingLeaves(true);
      try {
        const leaves = await getApprovedRequests();
        setApprovedLeaves(leaves || []);
      } catch (err) {
        console.error('Failed to load approved leaves:', err);
        setApprovedLeaves([]);
      } finally {
        setLoadingLeaves(false);
      }
    };

    loadLeaves();
  }, [getApprovedRequests]);

  // Load illnesses for the month
  useEffect(() => {
    const loadIllnesses = async () => {
      setLoadingIllnesses(true);
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        const illnessData = await getIllnessesByDateRange(startDate, endDate);
        setIllnesses(illnessData || []);
      } catch (err) {
        console.error('Failed to load illnesses:', err);
        setIllnesses([]);
      } finally {
        setLoadingIllnesses(false);
      }
    };

    if (user?.site_id) {
      loadIllnesses();
    }
  }, [month, year, user?.site_id, getIllnessesByDateRange]);

  // Helper: Check if a date is blocked by approved leave
  const isDateBlocked = (employeeId, dateStr) => {
    return approvedLeaves.some(leave => {
      if (leave.user_id !== employeeId) return false;
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const checkDate = new Date(dateStr);
      return checkDate >= startDate && checkDate <= endDate;
    });
  };

  // Helper: Get leave info for a date
  const getLeaveInfo = (employeeId, dateStr) => {
    return approvedLeaves.find(leave => {
      if (leave.user_id !== employeeId) return false;
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const checkDate = new Date(dateStr);
      return checkDate >= startDate && checkDate <= endDate;
    });
  };

  // Helper: Check if a date is blocked by illness (for day rendering)
  const isDateIll = (employeeId, dateStr) => {
    return illnesses.some(illness => {
      if (illness.employee_id !== employeeId) return false;
      const startDate = new Date(illness.start_date);
      const endDate = new Date(illness.end_date);
      const checkDate = new Date(dateStr);
      return checkDate >= startDate && checkDate <= endDate;
    });
  };

  // Helper: Get illness info for a date
  const getIllnessInfo = (employeeId, dateStr) => {
    return illnesses.find(illness => {
      if (illness.employee_id !== employeeId) return false;
      const startDate = new Date(illness.start_date);
      const endDate = new Date(illness.end_date);
      const checkDate = new Date(dateStr);
      return checkDate >= startDate && checkDate <= endDate;
    });
  };

  // Initialize shifts from mock data (deep copy to prevent shared references)
  React.useEffect(() => {
    if (data?.shifts_data) {
      const deepCopy = structuredClone(data.shifts_data);
      setShifts(deepCopy);
      setLastSavedShifts(deepCopy);
    }
  }, [data]);

  // Handle shift change
  const handleShiftChange = (employeeId, date, newShift) => {
    setShifts(prev => {
      const updated = {
        ...prev,
        [employeeId]: {
          ...prev[employeeId]
        }
      };

      // FIXED: If shift is "—" (empty), remove the key instead of setting it
      if (newShift === '—') {
        delete updated[employeeId][date];
      } else {
        updated[employeeId][date] = newShift;
      }

      return updated;
    });
  };

  // Check if shift was changed from last saved state
  const isShiftChanged = (employeeId, date) => {
    const saved = lastSavedShifts?.[employeeId]?.[date];
    const current = shifts?.[employeeId]?.[date];
    // FIXED: Compare values OR check if key was added/removed
    // If either is undefined but not both, the key was added/removed = changed
    if ((saved === undefined) !== (current === undefined)) {
      return true;
    }
    return saved !== current;
  };

  // Get count of changed shifts (including removed shifts)
  const changedCount = (() => {
    let count = 0;
    // Check all employees
    Object.keys(shifts || {}).forEach(empId => {
      const daysInMonth = new Date(year, month, 0).getDate();
      // Check all days in month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (isShiftChanged(empId, dateStr)) {
          count++;
        }
      }
    });
    return count;
  })();

  // Handle save
  const handleSaveShifts = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);

      // Call real API
      const result = await saveShifts(shifts);

      // Update saved state so badges disappear
      setLastSavedShifts(structuredClone(shifts));
      alert(`✅ ${changedCount} turni salvati con successo!`);

    } catch (error) {
      console.error('❌ Save failed:', error);
      setSaveError(error.message || 'Errore nel salvataggio');
      alert(`❌ ${error.message || 'Errore nel salvataggio'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleResetShifts = () => {
    if (window.confirm('Sei sicuro? Perderai tutti i cambiamenti non salvati.')) {
      // FIXED: Reset to lastSavedShifts (last save), not original data
      setShifts(structuredClone(lastSavedShifts));
    }
  };

  // Get shift count for employee
  const getShiftCount = (employeeId) => {
    const empShifts = shifts?.[employeeId] || {};
    return Object.keys(empShifts).length;
  };

  // Handle CSV export
  const handleExportCSV = () => {
    const lines = [];

    // Header row
    lines.push('Dipendente,Data,Giorno,Turno');

    // Data rows
    (data.employees || []).forEach(emp => {
      Object.entries(shifts?.[emp.id] || {}).forEach(([date, shift]) => {
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleString('it-IT', { weekday: 'long' });
        const formattedDate = dateObj.toLocaleDateString('it-IT');
        lines.push(`"${emp.name}","${formattedDate}","${dayName}","${shift}"`);
      });
    });

    // Create blob and download
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // FIXED: Use selected month/year in filename
    const monthName = new Date(year, month - 1).toLocaleString('it-IT', { month: 'long' });
    const filename = `planning_${monthName}_${year}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert('✅ CSV esportato con successo!');
  };

  if (userLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user?.site_id) {
    return <Container sx={{ p: 4 }}><Typography color="error">Accesso negato: nessun negozio assegnato.</Typography></Container>;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-linen">
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>📅 Planning Turni</h1>
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

      <Container maxWidth="lg" sx={{ paddingY: '32px' }}>
        {/* Header */}
        <Box sx={{ marginBottom: '32px' }}>
          <Typography variant="h3" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '16px' }}>
            Turni di {new Date(year, month - 1).toLocaleString('it-IT', { month: 'long' })} {year}
          </Typography>

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
        </Box>

        {/* KPI Cards */}
        {data && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ marginBottom: '20px' }}>
            <Card sx={{ flex: 1, borderLeft: '4px solid #1E3A5F' }}>
              <CardContent>
                <Typography color="textSecondary">Dipendenti</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {data.employees?.length || 0}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
              <CardContent>
                <Typography color="textSecondary">Turni Assegnati</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {(data.employees || []).reduce((sum, emp) => sum + getShiftCount(emp.id), 0)}/{(data.employees?.length || 0) * daysInMonth}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, borderLeft: '4px solid #7C3AED' }}>
              <CardContent>
                <Typography color="textSecondary">Giorni del Mese</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {daysInMonth}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* Save/Reset/Export Buttons */}
        <Box sx={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          {changedCount > 0 && (
            <>
              <Button
                variant="contained"
                disabled={isSaving}
                sx={{ backgroundColor: '#2D7049', '&:hover': { backgroundColor: '#1e5034' } }}
                onClick={handleSaveShifts}
              >
                {isSaving ? '⏳ Salvataggio...' : `💾 Salva ${changedCount} Turni`}
              </Button>
              <Button
                variant="outlined"
                disabled={isSaving}
                sx={{ borderColor: '#C0392B', color: '#C0392B' }}
                onClick={handleResetShifts}
              >
                🔄 Ripristina
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            disabled={isSaving}
            sx={{ borderColor: '#1E3A5F', color: '#1E3A5F', marginLeft: 'auto' }}
            onClick={handleExportCSV}
          >
            📥 Esporta CSV
          </Button>
        </Box>

        {/* Shifts Table */}
        {error && (
          <Box sx={{ p: 3, backgroundColor: '#FEE2E2', borderRadius: 2, mb: 2 }}>
            <Typography color="error" fontWeight="bold">Errore nel caricamento turni</Typography>
            <Typography color="error" variant="body2">{error.message || String(error)}</Typography>
          </Box>
        )}
        {loading && !data && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {data ? (
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#1E3A5F' }}>
                    <TableCell
                      sx={{
                        color: '#FFFFFF',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        width: '210px',
                        minWidth: '210px',
                        position: 'sticky',
                        left: 0,
                        backgroundColor: '#1E3A5F',
                        zIndex: 3,
                        boxShadow: '4px 0 6px -2px rgba(0,0,0,0.18)'
                      }}
                    >
                      Dipendente
                    </TableCell>
                    {days.map(day => {
                      const dateObj = new Date(year, month - 1, day);
                      const dayName = dateObj.toLocaleString('it-IT', { weekday: 'short' });
                      const isWeekend = [0, 6].includes(dateObj.getDay());
                      return (
                        <TableCell
                          key={day}
                          align="center"
                          sx={{
                            color: isWeekend ? '#A5C0DC' : '#FFFFFF',
                            fontWeight: 'bold',
                            minWidth: '58px',
                            fontSize: '11px',
                            padding: '6px 2px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {day} {dayName}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.employees || []).map((emp, rowIdx) => {
                    const shiftCount = getShiftCount(emp.id);
                    const isComplete = shiftCount === daysInMonth;
                    const rowBg = rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAF8';
                    return (
                      <TableRow key={emp.id} sx={{ '&:hover td': { backgroundColor: '#EEF2F7' } }}>
                        <TableCell
                          sx={{
                            position: 'sticky',
                            left: 0,
                            backgroundColor: rowBg,
                            zIndex: 2,
                            boxShadow: '4px 0 6px -2px rgba(0,0,0,0.18)',
                            whiteSpace: 'nowrap',
                            padding: '8px 12px'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
                              {emp.name}
                            </span>
                            <Box
                              sx={{
                                fontSize: '11px',
                                backgroundColor: isComplete ? '#D4EDDA' : '#F5F2ED',
                                color: isComplete ? '#155724' : '#6B625A',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                border: isComplete ? '1px solid #28A745' : 'none',
                                flexShrink: 0
                              }}
                            >
                              {shiftCount}/{daysInMonth}
                            </Box>
                          </Box>
                        </TableCell>
                        {days.map(day => {
                          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const shift = shifts?.[emp.id]?.[dateStr] || '—';
                          const color = SHIFT_COLORS[shift];
                          const isChanged = isShiftChanged(emp.id, dateStr);
                          const blocked = isDateBlocked(emp.id, dateStr);
                          const leaveInfo = blocked ? getLeaveInfo(emp.id, dateStr) : null;
                          const ill = isDateIll(emp.id, dateStr);
                          const illnessInfo = ill ? getIllnessInfo(emp.id, dateStr) : null;

                          return (
                            <TableCell
                              key={`${emp.id}-${day}`}
                              align="center"
                              sx={{ padding: '4px 2px', position: 'relative', backgroundColor: ill ? 'rgba(220, 38, 38, 0.1)' : (blocked ? '#FEE2E2' : rowBg) }}
                            >
                              {isChanged && (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '7px',
                                    height: '7px',
                                    backgroundColor: '#C0392B',
                                    borderRadius: '50%',
                                    zIndex: 10
                                  }}
                                />
                              )}
                              {blocked && (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    top: '2px',
                                    left: '2px',
                                    width: '7px',
                                    height: '7px',
                                    backgroundColor: '#2D7049',
                                    borderRadius: '50%',
                                    zIndex: 10
                                  }}
                                  title={leaveInfo ? `${leaveInfo.leave_type}` : 'Ferie'}
                                />
                              )}
                              {ill && (
                                <Box
                                  onClick={() => {
                                    setSelectedIllness(illnessInfo);
                                    setIllnessModalOpen(true);
                                  }}
                                  sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    backgroundColor: 'transparent',
                                    zIndex: 5,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      fontSize: '1.2rem',
                                      fontWeight: 900,
                                      color: '#DC2626',
                                      opacity: 0.6,
                                      transform: 'scaleY(0.8)',
                                    }}
                                    title="Malattia comunicata"
                                  >
                                    ▲ M
                                  </Box>
                                </Box>
                              )}
                              <Tooltip title={ill ? 'Malattia comunicata' : (blocked ? `Bloccato da ferie: ${leaveInfo?.leave_type || 'N/A'}` : '')}>
                                <div>
                                  <Select
                                    value={shift}
                                    disabled={isSaving || blocked || ill}
                                    onChange={(e) => handleShiftChange(emp.id, dateStr, e.target.value)}
                                    renderValue={(val) => (val && val !== '—') ? val.toUpperCase() : (blocked || ill ? '🔒' : '—')}
                                    sx={{
                                      width: '52px',
                                      height: '36px',
                                      backgroundColor: blocked ? '#DC2626' : (color?.bg || '#E5E7EB'),
                                      color: 'white',
                                      fontWeight: 'bold',
                                      fontSize: '12px',
                                      opacity: blocked ? 0.7 : 1,
                                      '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: isChanged ? '#C0392B' : 'transparent',
                                        borderWidth: isChanged ? '2px' : '0px'
                                      },
                                      '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: isChanged ? '#C0392B' : 'transparent'
                                      },
                                      '& .MuiSvgIcon-root': { display: 'none' },
                                      '& .MuiSelect-select': { padding: '0 !important', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                                    }}
                                  >
                                    <MenuItem value="m" sx={{ backgroundColor: SHIFT_COLORS['m'].bg, color: 'white' }}>m - Mattino</MenuItem>
                                    <MenuItem value="p" sx={{ backgroundColor: SHIFT_COLORS['p'].bg, color: 'white' }}>p - Pomeriggio</MenuItem>
                                    <MenuItem value="s" sx={{ backgroundColor: SHIFT_COLORS['s'].bg, color: 'white' }}>s - Sera</MenuItem>
                                    <MenuItem value="R" sx={{ backgroundColor: SHIFT_COLORS['R'].bg, color: 'white' }}>R - Riposo</MenuItem>
                                    <MenuItem value="—">—</MenuItem>
                                  </Select>
                                </div>
                              </Tooltip>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        ) : (
          <Typography>Caricamento...</Typography>
        )}

        {/* Legend */}
        <Card sx={{ marginTop: '30px', backgroundColor: '#F5F2ED' }}>
          <CardContent>
            <Stack spacing={2}>
              <div>
                <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '12px' }}>
                  💡 Legenda Turni
                </Typography>
                <Box sx={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {Object.entries(SHIFT_COLORS).map(([key, { bg, label }]) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box sx={{ backgroundColor: bg, color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        {key}
                      </Box>
                      <Typography variant="body2">{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </div>

              <div>
                <Typography variant="h6" sx={{ fontWeight: 'bold', marginBottom: '12px' }}>
                  🔒 Blocchi Ferie Approvate
                </Typography>
                <Box sx={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Box sx={{ backgroundColor: '#DC2626', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                      🔒
                    </Box>
                    <Typography variant="body2">Giorno bloccato da ferie approvate</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Box sx={{ backgroundColor: '#FEE2E2', border: '1px solid #DC2626', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: '#DC2626' }}>
                      ⚠️
                    </Box>
                    <Typography variant="body2">Sfondo rosso = giorno bloccato</Typography>
                  </Box>
                </Box>
              </div>
            </Stack>
          </CardContent>
        </Card>

        {/* Illness Modal */}
        <ManagerIllnessModal
          open={illnessModalOpen}
          onClose={() => setIllnessModalOpen(false)}
          illness={selectedIllness}
        />
      </Container>
    </div>
  );
};
