import React, { useState, useEffect, useMemo } from 'react';
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
  Button,
  CircularProgress,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  GlobalStyles,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useShifts } from '../hooks/useShifts';
import { useShiftUpdate } from '../hooks/useShiftUpdate';
import { useLeave } from '../../leave/hooks/useLeave';
import { useIllness } from '../../illness/hooks/useIllness';
import { ManagerIllnessModal } from '../../illness/components/ManagerIllnessModal';
import { NavBar } from '../../../components/NavBar';
import { pad, inDateRange } from '../../../utils/dateUtils';

const SHIFT_COLORS = {
  m: { bg: '#1E3A5F', label: 'Mattino' },
  p: { bg: '#B45309', label: 'Pomeriggio' },
  s: { bg: '#7C3AED', label: 'Sera' },
  R: { bg: '#6B7280', label: 'Riposo' },
};

// Returns array-of-arrays: each inner array = day numbers for a Mon-anchored week
const getWeeksOfMonth = (year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks = [];
  let current = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0=Sun 1=Mon
    if (dow === 1 && current.length > 0) {
      weeks.push([...current]);
      current = [];
    }
    current.push(day);
  }
  if (current.length > 0) weeks.push([...current]);
  return weeks;
};

const formatWeekLabel = (year, month, week) => {
  if (!week?.length) return '';
  const fmt = (d) => new Date(year, month - 1, d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  return `${fmt(week[0])} – ${fmt(week[week.length - 1])}`;
};

export const PlanningPage = () => {
  const navigate = useNavigate();
  const { user, loading: userLoading } = useAuth();

  // ── Core state ────────────────────────────────────────────────────────────
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState({});
  const [lastSavedShifts, setLastSavedShifts] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [dataLoadError, setDataLoadError] = useState(null);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [illnesses, setIllnesses] = useState([]);
  const [selectedIllness, setSelectedIllness] = useState(null);
  const [illnessModalOpen, setIllnessModalOpen] = useState(false);

  // P.4 ── View mode
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [weekOffset, setWeekOffset] = useState(0);   // index into weeksOfMonth

  // P.1+P.3 ── Copy week
  const [copyWeekOpen, setCopyWeekOpen] = useState(false);
  const [copySource, setCopySource] = useState(0);
  const [copyDest, setCopyDest] = useState(1);
  const [copyConflicts, setCopyConflicts] = useState([]);
  const [copyWarningOpen, setCopyWarningOpen] = useState(false);
  const [pendingCopyShifts, setPendingCopyShifts] = useState(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const weeksOfMonth = useMemo(() => getWeeksOfMonth(year, month), [year, month]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDays = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );
  // Clamp weekOffset to valid range so a stale offset after month change
  // never produces a flash of allDays before the reset effect runs.
  const safeWeekOffset = Math.min(weekOffset, Math.max(0, weeksOfMonth.length - 1));
  const visibleDays = viewMode === 'month' ? allDays : (weeksOfMonth[safeWeekOffset] || allDays);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { getApprovedRequests } = useLeave();
  const { getIllnessesByDateRange } = useIllness();
  const { data, loading, error } = useShifts(user?.site_id, month, year);
  const { saveShifts } = useShiftUpdate(user?.site_id, month, year);

  // Auto-select current week when entering week mode
  useEffect(() => {
    if (viewMode !== 'week') return;
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      const idx = weeksOfMonth.findIndex((w) => w.includes(today.getDate()));
      setWeekOffset(idx >= 0 ? idx : 0);
    } else {
      setWeekOffset(0);
    }
  }, [viewMode, year, month]); // weeksOfMonth excluded intentionally: recomputed on year/month change

  useEffect(() => {
    (async () => {
      try {
        setDataLoadError(null);
        setApprovedLeaves((await getApprovedRequests()) || []);
      } catch (err) {
        console.error('[PlanningPage] Failed to load approved leaves:', err);
        setApprovedLeaves([]);
        setDataLoadError('Impossibile caricare le ferie approvate. I blocchi ferie potrebbero non essere visibili.');
      }
    })();
  }, [getApprovedRequests]);

  useEffect(() => {
    if (!user?.site_id) return;
    (async () => {
      try {
        const lastDay = new Date(year, month, 0).getDate();
        const result = await getIllnessesByDateRange(
          `${year}-${pad(month)}-01`,
          `${year}-${pad(month)}-${lastDay}`
        );
        setIllnesses(result || []);
      } catch (err) {
        console.error('[PlanningPage] Failed to load illnesses:', err);
        setIllnesses([]);
        setDataLoadError('Impossibile caricare i dati malattia. Le celle potrebbero non mostrare i blocchi corretti.');
      }
    })();
  }, [month, year, user?.site_id, getIllnessesByDateRange]);

  useEffect(() => {
    if (data?.shifts_data) {
      const copy = structuredClone(data.shifts_data);
      setShifts(copy);
      setLastSavedShifts(copy);
    }
  }, [data]);

  // ── Date helpers ──────────────────────────────────────────────────────────
  const isDateBlocked = (empId, dateStr) =>
    approvedLeaves.some((l) => l.user_id === empId && inDateRange(dateStr, l.start_date, l.end_date));

  const getLeaveInfo = (empId, dateStr) =>
    approvedLeaves.find((l) => l.user_id === empId && inDateRange(dateStr, l.start_date, l.end_date));

  const isDateIll = (empId, dateStr) =>
    illnesses.some((i) => i.employee_id === empId && inDateRange(dateStr, i.start_date, i.end_date));

  const getIllnessInfo = (empId, dateStr) =>
    illnesses.find((i) => i.employee_id === empId && inDateRange(dateStr, i.start_date, i.end_date));

  // ── Shift helpers ─────────────────────────────────────────────────────────
  const handleShiftChange = (empId, date, newShift) => {
    setShifts((prev) => {
      const updated = { ...prev, [empId]: { ...prev[empId] } };
      if (newShift === '—') {
        delete updated[empId][date];
      } else {
        updated[empId][date] = newShift;
      }
      return updated;
    });
  };

  const isShiftChanged = (empId, date) => {
    const saved = lastSavedShifts?.[empId]?.[date];
    const curr = shifts?.[empId]?.[date];
    return (saved === undefined) !== (curr === undefined) || saved !== curr;
  };

  const changedCount = useMemo(() => {
    let n = 0;
    Object.keys(shifts || {}).forEach((empId) => {
      for (let day = 1; day <= daysInMonth; day++) {
        const d = `${year}-${pad(month)}-${pad(day)}`;
        const saved = lastSavedShifts?.[empId]?.[d];
        const curr = shifts?.[empId]?.[d];
        if ((saved === undefined) !== (curr === undefined) || saved !== curr) n++;
      }
    });
    return n;
  }, [shifts, lastSavedShifts, year, month, daysInMonth]);

  const getShiftCount = (empId) => Object.keys(shifts?.[empId] || {}).length;

  // ── Save / Reset ──────────────────────────────────────────────────────────
  const handleSaveShifts = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      await saveShifts(shifts);
      setLastSavedShifts(structuredClone(shifts));
      alert(`✅ ${changedCount} turni salvati con successo!`);
    } catch (err) {
      setSaveError(err.message || 'Errore nel salvataggio');
      alert(`❌ ${err.message || 'Errore nel salvataggio'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetShifts = () => {
    if (window.confirm('Sei sicuro? Perderai tutti i cambiamenti non salvati.')) {
      setShifts(structuredClone(lastSavedShifts));
    }
  };

  // P.2 ── CSV export
  const handleExportCSV = () => {
    const lines = ['Dipendente,Data,Giorno,Turno'];
    (data?.employees || []).forEach((emp) => {
      Object.entries(shifts?.[emp.id] || {}).forEach(([date, shift]) => {
        const d = new Date(date);
        lines.push(`"${emp.name}","${d.toLocaleDateString('it-IT')}","${d.toLocaleString('it-IT', { weekday: 'long' })}","${shift}"`);
      });
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const mName = new Date(year, month - 1).toLocaleString('it-IT', { month: 'long' });
    link.download = `planning_${mName}_${year}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // P.2 ── PDF via browser print
  const handleExportPDF = () => window.print();

  // P.1+P.3 ── Copy week
  const computeWeekCopy = (srcIdx, destIdx) => {
    const srcWeek = weeksOfMonth[srcIdx] || [];
    const destWeek = weeksOfMonth[destIdx] || [];
    const destByDow = {};
    destWeek.forEach((day) => { destByDow[new Date(year, month - 1, day).getDay()] = day; });

    const newShifts = structuredClone(shifts);
    const conflicts = [];

    (data?.employees || []).forEach((emp) => {
      srcWeek.forEach((srcDay) => {
        const dow = new Date(year, month - 1, srcDay).getDay();
        const destDay = destByDow[dow];
        if (!destDay) return;

        const srcDate = `${year}-${pad(month)}-${pad(srcDay)}`;
        const destDate = `${year}-${pad(month)}-${pad(destDay)}`;
        const srcShift = newShifts[emp.id]?.[srcDate];
        const existingDest = newShifts[emp.id]?.[destDate];

        if (existingDest && existingDest !== '—' && existingDest !== srcShift) {
          conflicts.push({ empName: emp.name, date: destDate, from: existingDest, to: srcShift || '–' });
        }

        if (srcShift && srcShift !== '—') {
          if (!newShifts[emp.id]) newShifts[emp.id] = {};
          newShifts[emp.id][destDate] = srcShift;
        } else {
          delete newShifts[emp.id]?.[destDate];
        }
      });
    });

    return { newShifts, conflicts };
  };

  const handleOpenCopyWeek = () => {
    const defaultSrc = viewMode === 'week' ? weekOffset : 0;
    const defaultDest = Math.min(defaultSrc + 1, weeksOfMonth.length - 1);
    setCopySource(defaultSrc);
    setCopyDest(defaultDest !== defaultSrc ? defaultDest : (defaultSrc === 0 ? 1 : 0));
    setCopyConflicts([]);
    setPendingCopyShifts(null);
    setCopyWeekOpen(true);
  };

  const handleConfirmCopyWeek = () => {
    const { newShifts, conflicts } = computeWeekCopy(copySource, copyDest);
    if (conflicts.length > 0) {
      setCopyConflicts(conflicts);
      setPendingCopyShifts(newShifts);
      setCopyWarningOpen(true);
    } else {
      setShifts(newShifts);
      setCopyWeekOpen(false);
    }
  };

  const handleApplyCopyWithOverwrite = () => {
    if (pendingCopyShifts) setShifts(pendingCopyShifts);
    setCopyWarningOpen(false);
    setCopyWeekOpen(false);
    setCopyConflicts([]);
    setPendingCopyShifts(null);
  };

  // ── Auth guard ────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-linen">

      {/* P.2: Print styles */}
      <GlobalStyles styles={`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          .MuiAppBar-root { display: none !important; }
          .MuiButton-root { display: none !important; }
          .MuiCard-root { display: none !important; }
          .MuiToggleButtonGroup-root { display: none !important; }
          .MuiSelect-root { display: none !important; }
          .MuiTableCell-root { padding: 2px 4px !important; font-size: 9px !important; border: 1px solid #ccc !important; }
          .MuiPaper-root { box-shadow: none !important; }
          .print-title { display: block !important; font-size: 14px; font-weight: bold; margin-bottom: 8px; }
        }
        .print-title { display: none; }
      `} />

      {/* Navbar */}
      <NavBar title="📅 Planning Turni">
        <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
          ← Dashboard
        </Button>
      </NavBar>

      <Container maxWidth="lg" sx={{ paddingY: '32px' }}>

        {/* Print-only title */}
        <div className="print-title">
          📅 Planning Turni — {new Date(year, month - 1).toLocaleString('it-IT', { month: 'long' })} {year}
        </div>

        {/* Header */}
        <Box sx={{ marginBottom: '24px' }} className="no-print">
          <Typography variant="h3" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '16px' }}>
            Turni di {new Date(year, month - 1).toLocaleString('it-IT', { month: 'long' })} {year}
          </Typography>

          {/* Month/Year selectors + P.4 view toggle */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} sx={{ width: '150px' }}>
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

            {/* P.4: View mode toggle */}
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => { if (v) setViewMode(v); }}
              size="small"
              sx={{ ml: 'auto' }}
            >
              <ToggleButton value="month" sx={{ px: 2, textTransform: 'none' }}>📅 Mese</ToggleButton>
              <ToggleButton value="week" sx={{ px: 2, textTransform: 'none' }}>🗓 Settimana</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* P.4: Week navigation bar */}
          {viewMode === 'week' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={safeWeekOffset === 0}
                onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                ← Precedente
              </Button>
              <Typography sx={{ fontWeight: 600, minWidth: 240, textAlign: 'center' }}>
                Settimana {safeWeekOffset + 1}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  ({formatWeekLabel(year, month, weeksOfMonth[safeWeekOffset])})
                </Typography>
              </Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={safeWeekOffset >= weeksOfMonth.length - 1}
                onClick={() => setWeekOffset((w) => Math.min(weeksOfMonth.length - 1, w + 1))}
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                Successiva →
              </Button>
            </Box>
          )}
        </Box>

        {/* KPI Cards */}
        {data && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} className="no-print">
            <Card sx={{ flex: 1, borderLeft: '4px solid #1E3A5F' }}>
              <CardContent>
                <Typography color="textSecondary">Dipendenti</Typography>
                <Typography variant="h5" fontWeight="bold">{data.employees?.length || 0}</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, borderLeft: '4px solid #B45309' }}>
              <CardContent>
                <Typography color="textSecondary">Turni Assegnati</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {(data.employees || []).reduce((s, emp) => s + getShiftCount(emp.id), 0)}/{(data.employees?.length || 0) * daysInMonth}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, borderLeft: '4px solid #7C3AED' }}>
              <CardContent>
                <Typography color="textSecondary">{viewMode === 'week' ? 'Giorni visibili' : 'Giorni del mese'}</Typography>
                <Typography variant="h5" fontWeight="bold">{visibleDays.length}</Typography>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* Action buttons */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }} className="no-print">
          {changedCount > 0 && (
            <>
              <Button
                variant="contained"
                disabled={isSaving}
                sx={{ backgroundColor: '#2D7049', '&:hover': { backgroundColor: '#1e5034' }, textTransform: 'none' }}
                onClick={handleSaveShifts}
              >
                {isSaving ? '⏳ Salvataggio...' : `💾 Salva ${changedCount} Turni`}
              </Button>
              <Button
                variant="outlined"
                disabled={isSaving}
                sx={{ borderColor: '#C0392B', color: '#C0392B', textTransform: 'none' }}
                onClick={handleResetShifts}
              >
                🔄 Ripristina
              </Button>
            </>
          )}

          <Box sx={{ ml: changedCount > 0 ? 0 : 'auto', display: 'flex', gap: 1 }}>
            {/* P.1: Copy week */}
            <Tooltip title={weeksOfMonth.length < 2 ? 'Il mese ha una sola settimana' : ''}>
              <span>
                <Button
                  variant="outlined"
                  disabled={isSaving || weeksOfMonth.length < 2}
                  sx={{ borderColor: '#7C3AED', color: '#7C3AED', textTransform: 'none' }}
                  onClick={handleOpenCopyWeek}
                >
                  📋 Copia Settimana
                </Button>
              </span>
            </Tooltip>

            {/* P.2: PDF */}
            <Button
              variant="outlined"
              disabled={isSaving}
              sx={{ borderColor: '#1E3A5F', color: '#1E3A5F', textTransform: 'none' }}
              onClick={handleExportPDF}
            >
              🖨️ PDF
            </Button>

            <Button
              variant="outlined"
              disabled={isSaving}
              sx={{ borderColor: '#1E3A5F', color: '#1E3A5F', textTransform: 'none' }}
              onClick={handleExportCSV}
            >
              📥 CSV
            </Button>
          </Box>
        </Box>

        {/* Error banners */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Errore nel caricamento turni:</strong> {error.message || String(error)}
          </Alert>
        )}
        {dataLoadError && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setDataLoadError(null)}>
            {dataLoadError}
          </Alert>
        )}
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
            <strong>Errore nel salvataggio:</strong> {saveError}
          </Alert>
        )}

        {/* Loading */}
        {loading && !data && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Shifts table */}
        {data ? (
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#1E3A5F' }}>
                    <TableCell sx={{
                      color: '#FFF', fontWeight: 'bold', whiteSpace: 'nowrap',
                      width: '210px', minWidth: '210px',
                      position: 'sticky', left: 0,
                      backgroundColor: '#1E3A5F', zIndex: 3,
                      boxShadow: '4px 0 6px -2px rgba(0,0,0,0.18)',
                    }}>
                      Dipendente
                    </TableCell>
                    {visibleDays.map((day) => {
                      const dateObj = new Date(year, month - 1, day);
                      const isWeekend = [0, 6].includes(dateObj.getDay());
                      return (
                        <TableCell key={day} align="center" sx={{
                          color: isWeekend ? '#A5C0DC' : '#FFF',
                          fontWeight: 'bold', minWidth: '58px', fontSize: '11px',
                          padding: '6px 2px', whiteSpace: 'nowrap',
                        }}>
                          {day} {dateObj.toLocaleString('it-IT', { weekday: 'short' })}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.employees || []).map((emp, rowIdx) => {
                    const shiftCount = getShiftCount(emp.id);
                    const rowBg = rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAF8';
                    return (
                      <TableRow key={emp.id} sx={{ '&:hover td': { backgroundColor: '#EEF2F7' } }}>
                        <TableCell sx={{
                          position: 'sticky', left: 0, backgroundColor: rowBg, zIndex: 2,
                          boxShadow: '4px 0 6px -2px rgba(0,0,0,0.18)',
                          whiteSpace: 'nowrap', padding: '8px 12px',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{emp.name}</span>
                            <Box sx={{
                              fontSize: '11px',
                              backgroundColor: shiftCount === daysInMonth ? '#D4EDDA' : '#F5F2ED',
                              color: shiftCount === daysInMonth ? '#155724' : '#6B625A',
                              padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', flexShrink: 0,
                              border: shiftCount === daysInMonth ? '1px solid #28A745' : 'none',
                            }}>
                              {shiftCount}/{daysInMonth}
                            </Box>
                          </Box>
                        </TableCell>

                        {visibleDays.map((day) => {
                          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
                          const shift = shifts?.[emp.id]?.[dateStr] || '—';
                          const color = SHIFT_COLORS[shift];
                          const isChanged = isShiftChanged(emp.id, dateStr);
                          const blocked = isDateBlocked(emp.id, dateStr);
                          const leaveInfo = blocked ? getLeaveInfo(emp.id, dateStr) : null;
                          const ill = isDateIll(emp.id, dateStr);
                          const illnessInfo = ill ? getIllnessInfo(emp.id, dateStr) : null;

                          return (
                            <TableCell key={`${emp.id}-${day}`} align="center" sx={{
                              padding: '4px 2px', position: 'relative',
                              backgroundColor: ill ? '#DC2626' : (blocked ? '#0EA5E9' : rowBg),
                            }}>
                              {/* Illness or Leave full-cell overlay with icon + label */}
                              {(ill || blocked) && (
                                <Box onClick={ill ? () => { setSelectedIllness(illnessInfo); setIllnessModalOpen(true); } : undefined}
                                  sx={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    cursor: ill ? 'pointer' : 'default',
                                    zIndex: 5,
                                  }}>
                                  <Box sx={{ fontSize: '1.4rem' }}>
                                    {ill ? '🏥' : '🏖️'}
                                  </Box>
                                  <Box sx={{
                                    fontSize: '10px', fontWeight: 700, color: 'white',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    marginTop: '2px',
                                  }}>
                                    {ill ? 'Malattia' : 'Ferie'}
                                  </Box>
                                </Box>
                              )}

                              {/* Red dot = unsaved change */}
                              {isChanged && (
                                <Box sx={{
                                  position: 'absolute', top: '2px', right: '2px',
                                  width: '7px', height: '7px',
                                  backgroundColor: '#C0392B', borderRadius: '50%', zIndex: 10,
                                }} />
                              )}

                              <Tooltip title={ill ? 'Malattia comunicata — clicca per dettagli' : (blocked ? `Bloccato: ${leaveInfo?.leave_type || 'Ferie'}` : '')}>
                                <div>
                                  <Select
                                    value={shift}
                                    disabled={isSaving || blocked || ill}
                                    onChange={(e) => handleShiftChange(emp.id, dateStr, e.target.value)}
                                    renderValue={(val) =>
                                      (val && val !== '—') ? val.toUpperCase() : (blocked || ill ? '—' : '—')
                                    }
                                    sx={{
                                      width: '52px', height: '36px',
                                      backgroundColor: (blocked || ill) ? 'transparent' : (color?.bg || '#E5E7EB'),
                                      color: 'white', fontWeight: 'bold', fontSize: '12px',
                                      visibility: (blocked || ill) ? 'hidden' : 'visible',
                                      '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: isChanged ? '#C0392B' : 'transparent',
                                        borderWidth: isChanged ? '2px' : '0px',
                                      },
                                      '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: isChanged ? '#C0392B' : 'transparent',
                                      },
                                      '& .MuiSvgIcon-root': { display: 'none' },
                                      '& .MuiSelect-select': { padding: '0 !important', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                                    }}
                                  >
                                    <MenuItem value="m" sx={{ backgroundColor: SHIFT_COLORS.m.bg, color: 'white' }}>m - Mattino</MenuItem>
                                    <MenuItem value="p" sx={{ backgroundColor: SHIFT_COLORS.p.bg, color: 'white' }}>p - Pomeriggio</MenuItem>
                                    <MenuItem value="s" sx={{ backgroundColor: SHIFT_COLORS.s.bg, color: 'white' }}>s - Sera</MenuItem>
                                    <MenuItem value="R" sx={{ backgroundColor: SHIFT_COLORS.R.bg, color: 'white' }}>R - Riposo</MenuItem>
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
          !loading && <Typography>Caricamento...</Typography>
        )}

        {/* Legend */}
        <Card sx={{ mt: 4, backgroundColor: '#F5F2ED' }} className="no-print">
          <CardContent>
            <Stack spacing={2}>
              <div>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1.5 }}>💡 Legenda Turni</Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {Object.entries(SHIFT_COLORS).map(([key, { bg, label }]) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ backgroundColor: bg, color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{key}</Box>
                      <Typography variant="body2">{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </div>
              <div>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>🏥 / 🏖️ Assenze</Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ backgroundColor: '#DC2626', color: 'white', padding: '6px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', minHeight: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '50px' }}>🏥<span style={{ fontSize: '10px', marginTop: '2px' }}>MAL.</span></Box>
                    <Typography variant="body2">Malattia comunicata — clicca per dettagli</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ backgroundColor: '#0EA5E9', color: 'white', padding: '6px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', minHeight: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '50px' }}>🏖️<span style={{ fontSize: '10px', marginTop: '2px' }}>FER.</span></Box>
                    <Typography variant="body2">Ferie approvate — turno bloccato</Typography>
                  </Box>
                </Box>
              </div>
            </Stack>
          </CardContent>
        </Card>

        {/* P.1: Copy Week dialog */}
        <Dialog open={copyWeekOpen} onClose={() => setCopyWeekOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>📋 Copia Settimana</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Copia i turni da una settimana a un'altra. I giorni vengono abbinati per giorno della settimana (Lunedì→Lunedì, ecc.). I giorni non presenti nella settimana destinazione vengono ignorati.
            </Typography>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Settimana sorgente</Typography>
                <Select fullWidth value={copySource} onChange={(e) => setCopySource(e.target.value)} size="small">
                  {weeksOfMonth.map((week, idx) => (
                    <MenuItem key={idx} value={idx}>
                      Settimana {idx + 1} — {formatWeekLabel(year, month, week)}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Settimana destinazione</Typography>
                <Select fullWidth value={copyDest} onChange={(e) => setCopyDest(e.target.value)} size="small">
                  {weeksOfMonth.map((week, idx) => (
                    <MenuItem key={idx} value={idx} disabled={idx === copySource}>
                      Settimana {idx + 1} — {formatWeekLabel(year, month, week)}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCopyWeekOpen(false)} sx={{ textTransform: 'none' }}>Annulla</Button>
            <Button
              variant="contained"
              onClick={handleConfirmCopyWeek}
              disabled={copySource === copyDest}
              sx={{ backgroundColor: '#7C3AED', '&:hover': { backgroundColor: '#5b21b6' }, textTransform: 'none' }}
            >
              Copia Turni
            </Button>
          </DialogActions>
        </Dialog>

        {/* P.3: Conflict overwrite warning */}
        <Dialog open={copyWarningOpen} onClose={() => setCopyWarningOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>⚠️ Conflitti di Sovrascrittura</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              La settimana destinazione ha già <strong>{copyConflicts.length}</strong> turni assegnati che verranno sostituiti.
            </Alert>
            <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
              {copyConflicts.slice(0, 20).map((c, i) => (
                <Typography key={i} variant="body2" sx={{ py: 0.25 }}>
                  <strong>{c.empName}</strong> · {new Date(c.date).toLocaleDateString('it-IT')} · {c.from} → {c.to}
                </Typography>
              ))}
              {copyConflicts.length > 20 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  ... e altri {copyConflicts.length - 20} conflitti
                </Typography>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCopyWarningOpen(false)} sx={{ textTransform: 'none' }}>Annulla</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={handleApplyCopyWithOverwrite}
              sx={{ textTransform: 'none' }}
            >
              Sovrascrivi {copyConflicts.length} Turni
            </Button>
          </DialogActions>
        </Dialog>

        {/* Illness detail modal */}
        <ManagerIllnessModal
          open={illnessModalOpen}
          onClose={() => setIllnessModalOpen(false)}
          illness={selectedIllness}
        />
      </Container>
    </div>
  );
};
