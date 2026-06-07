import React, { useState, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  TextField,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
  Alert,
  Pagination,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import { usePresences } from '../../dashboard/hooks/usePresences';
import { useCheckinCorrection } from '../hooks/useCheckinCorrection';
import authService from '../../../services/authService';

const CORRECTION_WINDOW_DAYS = 7;

const isEditable = (timestamp) => {
  const diffDays = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= CORRECTION_WINDOW_DAYS;
};

const toDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const CorrectionsPage = () => {
  const navigate = useNavigate();
  const userSiteId = authService.getSiteId();

  const [filters, setFilters] = useState({
    site_id: userSiteId || null,
    employee_id: null,
    date_from: null,
    date_to: null,
    limit: 20,
    offset: 0,
  });
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [modal, setModal] = useState({
    open: false,
    checkin: null,
    type: '',
    timestamp: '',
    correction_note: '',
  });
  const [saveError, setSaveError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const memoizedFilters = useMemo(() => filters, [
    filters.site_id, filters.employee_id, filters.date_from,
    filters.date_to, filters.limit, filters.offset,
  ]);

  const { data, loading, error, refetch } = usePresences(memoizedFilters);
  const { correctCheckin, loading: saving } = useCheckinCorrection();

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  const handleApplyFilters = () => {
    setFilters(prev => ({
      ...prev,
      employee_id: employeeSearch.trim() || null,
      offset: 0,
    }));
  };

  const handleClearFilters = () => {
    setEmployeeSearch('');
    setTypeFilter('');
    setFilters({
      site_id: userSiteId || null,
      employee_id: null,
      date_from: null,
      date_to: null,
      limit: 20,
      offset: 0,
    });
  };

  const openModal = (checkin) => {
    setSaveError(null);
    setModal({
      open: true,
      checkin,
      type: checkin.type,
      timestamp: toDatetimeLocal(checkin.timestamp),
      correction_note: checkin.correction_note || '',
    });
  };

  const closeModal = () => setModal(prev => ({ ...prev, open: false }));

  const handleSave = async () => {
    setSaveError(null);
    const { checkin, type, timestamp, correction_note } = modal;
    try {
      const isoTimestamp = timestamp ? new Date(timestamp).toISOString() : undefined;
      await correctCheckin(checkin.id, {
        type: type !== checkin.type ? type : undefined,
        timestamp: isoTimestamp !== new Date(checkin.timestamp).toISOString() ? isoTimestamp : undefined,
        correction_note: correction_note.trim() || undefined,
      });
      setSuccessMsg(`Check-in di ${checkin.employee_name} corretto con successo.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      closeModal();
      refetch();
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const pageCount = Math.ceil(total / filters.limit);
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;

  // Client-side type filter (fast, no extra API call)
  const visibleRows = typeFilter ? rows.filter(r => r.type === typeFilter) : rows;

  return (
    <div className="min-h-screen bg-linen">
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>✏️ Correzioni</h1>
          <Box sx={{ display: 'flex', gap: '12px' }}>
            <Button color="inherit" onClick={() => navigate('/dashboard')}
              sx={{ textTransform: 'none', fontSize: '14px' }}>
              ← Back to Dashboard
            </Button>
            <Button color="inherit" onClick={handleLogout}
              sx={{ textTransform: 'none', fontSize: '14px' }}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ paddingY: '32px' }}>
        <Box sx={{ marginBottom: '24px' }}>
          <Typography variant="h3" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '8px' }}>
            Correzioni Check-in
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Finestra di correzione: {CORRECTION_WINDOW_DAYS} giorni · Solo manager e admin
          </Typography>
        </Box>

        {/* Filters */}
        <Paper sx={{ padding: '16px', marginBottom: '20px' }}>
          <Box sx={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              label="Data inizio"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filters.date_from || ''}
              onChange={e => setFilters(prev => ({ ...prev, date_from: e.target.value || null, offset: 0 }))}
              sx={{ width: '160px' }}
            />
            <TextField
              label="Data fine"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filters.date_to || ''}
              onChange={e => setFilters(prev => ({ ...prev, date_to: e.target.value || null, offset: 0 }))}
              sx={{ width: '160px' }}
            />
            <TextField
              label="Dipendente"
              size="small"
              placeholder="Nome o cognome"
              value={employeeSearch}
              onChange={e => setEmployeeSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
              sx={{ width: '200px' }}
            />
            <Select
              size="small"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              displayEmpty
              sx={{ width: '120px' }}
            >
              <MenuItem value="">Tutti</MenuItem>
              <MenuItem value="IN">IN</MenuItem>
              <MenuItem value="OUT">OUT</MenuItem>
            </Select>
            <Button variant="contained" onClick={handleApplyFilters}
              disabled={loading}
              sx={{ backgroundColor: '#1E3A5F' }}>
              Cerca
            </Button>
            <Button variant="outlined" onClick={handleClearFilters} disabled={loading}>
              Reset
            </Button>
          </Box>
        </Paper>

        {successMsg && (
          <Alert severity="success" sx={{ marginBottom: '16px' }} onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ marginBottom: '16px' }}>
            {error}
          </Alert>
        )}

        {/* Table */}
        <Paper sx={{ overflow: 'hidden' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <CircularProgress />
            </Box>
          )}
          {!loading && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#1E3A5F' }}>
                    {['Data e Ora', 'Dipendente', 'Sede', 'Tipo', 'Stato', 'Azione'].map(h => (
                      <TableCell key={h} sx={{ color: '#FFFFFF', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ padding: '32px', color: '#6B7280' }}>
                        Nessun check-in trovato
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleRows.map((row, idx) => {
                    const corrected = Boolean(row.modified_at && row.modified_by_name);
                    const editable = isEditable(row.timestamp);
                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFAF8';
                    const ts = new Date(row.timestamp);
                    const dateLabel = ts.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const timeLabel = ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <TableRow key={row.id} sx={{ backgroundColor: rowBg, '&:hover td': { backgroundColor: '#EEF2F7' } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                          {dateLabel} {timeLabel}
                        </TableCell>
                        <TableCell sx={{ fontSize: '13px', fontWeight: 500 }}>
                          {row.employee_name || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '13px', color: '#6B7280' }}>
                          {row.site_name || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.type}
                            size="small"
                            sx={{
                              backgroundColor: row.type === 'IN' ? '#2D7049' : '#B45309',
                              color: '#FFFFFF',
                              fontWeight: 'bold',
                              fontSize: '12px',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {corrected ? (
                            <Box>
                              <Chip
                                label="Corretto"
                                size="small"
                                sx={{ backgroundColor: '#EEF2F7', color: '#1E3A5F', fontWeight: 600, fontSize: '11px', mb: '4px' }}
                              />
                              <Typography variant="caption" display="block" sx={{ color: '#6B7280', fontSize: '11px' }}>
                                da {row.modified_by_name}
                              </Typography>
                              <Typography variant="caption" display="block" sx={{ color: '#6B7280', fontSize: '11px' }}>
                                {new Date(row.modified_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </Typography>
                              {row.correction_note && (
                                <Typography variant="caption" display="block" sx={{ color: '#9CA3AF', fontSize: '11px', fontStyle: 'italic', maxWidth: '200px' }}>
                                  "{row.correction_note}"
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>Originale</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {editable ? (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<EditIcon sx={{ fontSize: '14px' }} />}
                              onClick={() => openModal(row)}
                              sx={{
                                borderColor: '#1E3A5F',
                                color: '#1E3A5F',
                                fontSize: '12px',
                                textTransform: 'none',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Correggi
                            </Button>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#D1D5DB', fontSize: '11px' }}>
                              Scaduto
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>

        {/* Pagination */}
        {pageCount > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <Pagination
              count={pageCount}
              page={currentPage}
              onChange={(_, page) => setFilters(prev => ({ ...prev, offset: (page - 1) * prev.limit }))}
              color="primary"
            />
          </Box>
        )}
      </Container>

      {/* Edit Modal */}
      <Dialog open={modal.open} onClose={closeModal} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: '#1E3A5F', color: '#FFFFFF', fontWeight: 'bold' }}>
          ✏️ Correggi Check-in
          {modal.checkin && (
            <Typography variant="body2" sx={{ color: '#A5C0DC', marginTop: '4px' }}>
              {modal.checkin.employee_name} · {modal.checkin.site_name}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ paddingTop: '24px !important' }}>
          {saveError && (
            <Alert severity="error" sx={{ marginBottom: '16px' }}>
              {saveError}
            </Alert>
          )}

          {/* Timestamp */}
          <TextField
            label="Data e Ora"
            type="datetime-local"
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            value={modal.timestamp}
            onChange={e => setModal(prev => ({ ...prev, timestamp: e.target.value }))}
            sx={{ marginBottom: '20px' }}
          />

          {/* Type toggle */}
          <Box sx={{ marginBottom: '20px' }}>
            <Typography variant="body2" sx={{ color: '#6B7280', marginBottom: '8px', fontWeight: 500 }}>
              Tipo Check-in
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={modal.type}
              onChange={(_, val) => { if (val) setModal(prev => ({ ...prev, type: val })); }}
              size="small"
            >
              <ToggleButton
                value="IN"
                sx={{
                  width: '80px',
                  fontWeight: 'bold',
                  '&.Mui-selected': { backgroundColor: '#2D7049', color: '#FFFFFF', '&:hover': { backgroundColor: '#1e5034' } },
                }}
              >
                IN
              </ToggleButton>
              <ToggleButton
                value="OUT"
                sx={{
                  width: '80px',
                  fontWeight: 'bold',
                  '&.Mui-selected': { backgroundColor: '#B45309', color: '#FFFFFF', '&:hover': { backgroundColor: '#8f3d07' } },
                }}
              >
                OUT
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Correction note */}
          <TextField
            label="Nota di correzione"
            multiline
            rows={3}
            fullWidth
            size="small"
            placeholder="Descrivi il motivo della correzione (opzionale)"
            value={modal.correction_note}
            onChange={e => setModal(prev => ({ ...prev, correction_note: e.target.value }))}
            inputProps={{ maxLength: 500 }}
            helperText={`${modal.correction_note.length}/500`}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', gap: '8px' }}>
          <Button onClick={closeModal} disabled={saving} sx={{ color: '#6B7280' }}>
            Annulla
          </Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={handleSave}
            sx={{ backgroundColor: '#1E3A5F', '&:hover': { backgroundColor: '#16304f' } }}
          >
            {saving ? <CircularProgress size={20} sx={{ color: '#FFFFFF' }} /> : '💾 Salva Correzione'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
