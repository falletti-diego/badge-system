import React, { useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControl, InputLabel, Select, MenuItem, FormHelperText,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import apiClient from '../../../services/apiClient';
import { extractErrorMessage, ROLE_LABELS } from '../tabs/EmployeesTab';

// Solo promozioni: 'manager' non è mai una destinazione (richiederebbe
// site_id, fuori scope — design spec 2026-08-30), 'director' non ha
// transizioni valide da qui (nessuna retrocessione).
const PROMOTION_TARGETS = {
  manager: ['senior_manager', 'director'],
  senior_manager: ['director'],
};

export function ChangeRoleDialog({ employee, allEmployees, onClose, onSuccess }) {
  const targets = employee ? (PROMOTION_TARGETS[employee.role] || []) : [];
  const [role, setRole] = useState('');
  const [reportsToId, setReportsToId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const approverFieldDisabled = role !== 'senior_manager';
  const approverOptions = employee && role === 'senior_manager'
    ? allEmployees.filter((e) => e.client_id === employee.client_id && e.role === 'director' && e.id !== employee.id)
    : [];

  const handleRoleChange = (value) => {
    setRole(value);
    setReportsToId(''); // azzerato ad ogni cambio ruolo, stesso pattern del form di creazione
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.patch(`/api/admin/employees/${employee.id}/role`, {
        role,
        reports_to_id: role === 'director' ? null : (reportsToId || null),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!employee} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Cambia ruolo — {employee?.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Solo promozioni: {employee ? ROLE_LABELS[employee.role] : ''} può diventare{' '}
          {targets.map((t) => ROLE_LABELS[t]).join(' o ')}. Nessuna via di rientro da qui.
        </DialogContentText>
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel id="change-role-label">Nuovo ruolo</InputLabel>
          <Select
            labelId="change-role-label" label="Nuovo ruolo" value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            {targets.map((t) => <MenuItem key={t} value={t}>{ROLE_LABELS[t]}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth disabled={approverFieldDisabled}>
          <InputLabel id="change-role-reports-to-label">Approvatore richieste personali</InputLabel>
          <Select
            labelId="change-role-reports-to-label" label="Approvatore richieste personali"
            value={reportsToId} onChange={(e) => setReportsToId(e.target.value)}
          >
            <MenuItem value="">— nessuno —</MenuItem>
            {approverOptions.map((a) => <MenuItem key={a.id} value={a.id}>{a.name} ({ROLE_LABELS[a.role]})</MenuItem>)}
          </Select>
          <FormHelperText>
            Chi approva ferie, malattia e correzioni cartellino di questa persona — se vuoto, ricade sull&apos;admin.
          </FormHelperText>
        </FormControl>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Annulla</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={loading || !role}
          startIcon={loading ? <CircularProgress size={16} /> : <SwapHorizIcon />}>
          {loading ? 'Salvataggio…' : 'Conferma'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
