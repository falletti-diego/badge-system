import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Chip, Stack, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import apiClient from '../../../services/apiClient';
import { useFetch } from '../components/useFetch';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import { CopyButton } from '../components/CopyButton';
import { EmployeeSyncWizardPage } from '../pages/EmployeeSyncWizardPage';
import { useEmployeeSync } from '../hooks/useEmployeeSync';

// ApiError-derived backend errors (ConflictError, InvalidManagerAssignmentError, ...) put a
// human-readable string in `data.message`. Zod validation failures (createValidationMiddleware
// in backend/src/middleware/validation.js) instead return `{ error: 'Validation Error', details:
// [{ field, message }, ...] }` with NO top-level `message` — so falling back straight to
// err.message left the admin looking at a generic Axios string like "Request failed with status
// code 400" (e.g. when submitting with no Sede selected). Surface the real reason instead.
function extractErrorMessage(err) {
  const data = err.response?.data;
  if (data?.message) return data.message;
  if (Array.isArray(data?.details) && data.details.length > 0) {
    const details = data.details
      .map((d) => d?.message)
      .filter(Boolean);
    if (details.length > 0) return details.join(', ');
  }
  return err.message;
}

export function EmployeesTab() {
  const { data: clients } = useFetch('/api/v1/admin/clients');
  const { data: allSites } = useFetch('/api/v1/admin/sites');
  // Unfiltered, independent of the table's "Filtra cliente" selection — used only to
  // compute availableManagers below, so the create-form's manager lookup never depends
  // on what the admin happens to have the employee table filtered to (see Fase 2
  // checkpoint review Finding 1).
  const { data: allEmployees } = useFetch('/api/v1/admin/employees');
  const [filterClient, setFilterClient] = useState('');
  const { data: employees, loading: empLoading, error: empFetchError, reload: reloadEmployees } = useFetch(
    filterClient ? `/api/admin/employees?client_id=${filterClient}` : '/api/v1/admin/employees'
  );
  const [form, setForm] = useState({
    client_id: '', email: '', name: '', phone: '',
    role: 'employee', site_id: '', password: '',
    external_employee_id: '', hiring_date: new Date().toISOString().slice(0, 10),
    manager_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [syncClientId, setSyncClientId] = useState('');
  const { exportHistory } = useEmployeeSync();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/employees/${deleteTarget.id}`);
      setDeleteTarget(null);
      reloadEmployees();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const clientSites = allSites.filter((s) => s.client_id === form.client_id);

  const availableManagers = allEmployees.filter(
    (e) => e.role === 'manager' && e.site_id === form.site_id && e.client_id === form.client_id
  );
  const matricolaInvalid = form.external_employee_id !== '' && !/^[A-Za-z0-9]*$/.test(form.external_employee_id);
  const managerFieldDisabled = form.role === 'manager' || !form.site_id;
  const managerHelperText = form.role === 'manager'
    ? 'I manager non hanno un manager di riferimento'
    : !form.site_id
      ? 'Seleziona prima una sede'
      : availableManagers.length === 0
        ? 'Nessun manager assegnato a questa sede — puoi comunque creare il dipendente'
        : undefined;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        client_id: form.client_id,
        email: form.email,
        name: form.name,
        role: form.role,
        ...(form.phone && { phone: form.phone }),
        ...(form.role === 'manager' && form.site_id && { site_id: form.site_id }),
        ...(form.role === 'employee' && form.site_id && { site_id: form.site_id, assigned_sites: [form.site_id] }),
        ...(form.password && { password: form.password }),
        ...(form.external_employee_id && { external_employee_id: form.external_employee_id }),
        ...(form.hiring_date && { hiring_date: form.hiring_date }),
        ...(form.manager_id && { manager_id: form.manager_id }),
      };
      const res = await apiClient.post('/api/v1/admin/employees', payload);
      const emp = res.data.data;
      const tempPwd = res.data.temp_password;
      setMsg({
        type: 'success',
        text: `Dipendente "${emp.name}" creato con successo.`,
        tempPwd,
      });
      setForm({ ...form, email: '', name: '', phone: '', site_id: '', password: '', external_employee_id: '', manager_id: '' });
      reloadEmployees();
    } catch (err) {
      setMsg({ type: 'error', text: extractErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      {/* Create single employee */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Nuovo Dipendente</Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl size="small" required sx={{ minWidth: 180 }}>
                  <InputLabel id="new-employee-client-label">Cliente</InputLabel>
                  <Select
                    labelId="new-employee-client-label"
                    label="Cliente" value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: '', manager_id: '' })}
                  >
                    {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Nome" required fullWidth size="small"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <TextField
                  label="Email" type="email" required fullWidth size="small"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Telefono" fullWidth size="small"
                  value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="new-employee-role-label">Ruolo</InputLabel>
                  <Select
                    labelId="new-employee-role-label"
                    label="Ruolo" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, manager_id: '' })}
                  >
                    <MenuItem value="employee">Dipendente</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" required sx={{ minWidth: 180 }}>
                  <InputLabel id="new-employee-site-label">Sede</InputLabel>
                  <Select
                    labelId="new-employee-site-label"
                    label="Sede" value={form.site_id}
                    onChange={(e) => setForm({ ...form, site_id: e.target.value, manager_id: '' })}
                  >
                    {clientSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Password (opzionale, auto se vuota)" fullWidth size="small" type="password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  helperText="Lascia vuoto per generare automaticamente"
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Matricola" fullWidth size="small"
                  value={form.external_employee_id}
                  onChange={(e) => setForm({ ...form, external_employee_id: e.target.value })}
                  error={matricolaInvalid}
                  helperText={matricolaInvalid ? 'Solo lettere e numeri' : undefined}
                />
                <TextField
                  label="Data assunzione" type="date" fullWidth size="small"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: new Date().toISOString().slice(0, 10) }}
                  value={form.hiring_date}
                  onChange={(e) => setForm({ ...form, hiring_date: e.target.value })}
                />
                <FormControl size="small" sx={{ minWidth: 220 }} disabled={managerFieldDisabled}>
                  <InputLabel id="new-employee-manager-label">Manager di riferimento</InputLabel>
                  <Select
                    labelId="new-employee-manager-label"
                    label="Manager di riferimento" value={form.manager_id}
                    onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                  >
                    <MenuItem value="">— nessuno —</MenuItem>
                    {availableManagers.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                  </Select>
                  {managerHelperText && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                      {managerHelperText}
                    </Typography>
                  )}
                </FormControl>
              </Stack>
              {msg && (
                <Alert severity={msg.type}>
                  {msg.text}
                  {msg.tempPwd && (
                    <Box mt={1} display="flex" alignItems="center" gap={1}>
                      <Typography variant="caption" component="span">Password temporanea:</Typography>
                      <Box
                        component="code"
                        sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.08)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                      >
                        {msg.tempPwd}
                      </Box>
                      <CopyButton text={msg.tempPwd} />
                    </Box>
                  )}
                </Alert>
              )}
              <Box>
                <Button type="submit" variant="contained" startIcon={<AddIcon />}
                  disabled={saving || !form.client_id || matricolaInvalid}>
                  {saving ? <CircularProgress size={18} /> : 'Crea Dipendente'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* Employee sync wizard entry point */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Aggiorna Dipendenti</Typography>
            <Button variant="outlined" onClick={() => exportHistory(syncClientId)} disabled={!syncClientId}>
              Esporta storico completo
            </Button>
          </Stack>
          <FormControl size="small" required sx={{ minWidth: 200, mb: 2 }}>
            <InputLabel>Cliente</InputLabel>
            <Select label="Cliente" value={syncClientId} onChange={(e) => setSyncClientId(e.target.value)}>
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          {syncClientId && <EmployeeSyncWizardPage clientId={syncClientId} />}
        </CardContent>
      </Card>

      {/* Employee list */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Dipendenti ({employees.length})</Typography>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filtra cliente</InputLabel>
              <Select label="Filtra cliente" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
                <MenuItem value="">Tutti</MenuItem>
                {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          {empFetchError && <Alert severity="error" sx={{ mb: 2 }}>{empFetchError}</Alert>}
          {empLoading ? <CircularProgress size={24} /> : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Ruolo</TableCell>
                    <TableCell>Matricola</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Sede</TableCell>
                    <TableCell>Creato</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{e.email}</TableCell>
                      <TableCell><Chip label={e.role} size="small" color={e.role === 'manager' ? 'primary' : 'default'} /></TableCell>
                      <TableCell sx={{ color: e.external_employee_id ? 'inherit' : 'text.disabled' }}>
                        {e.external_employee_id || '—'}
                      </TableCell>
                      <TableCell>{e.client_name}</TableCell>
                      <TableCell>{e.site_name || '—'}</TableCell>
                      <TableCell>{new Date(e.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Reset password">
                          <IconButton size="small" color="warning" onClick={() => setResetTarget(e)}>
                            <LockResetIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Disattiva dipendente">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(e)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>Nessun dipendente</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Disattiva dipendente "${deleteTarget?.name}"?`}
        description="Il dipendente non potrà più effettuare check-in e non comparirà nelle liste attive. Lo storico dei check-in resta intatto e il dipendente può essere riattivato in futuro caricando di nuovo il suo nominativo con Stato=Attivo nel wizard Aggiorna Dipendenti."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      {resetTarget && (
        <ResetPasswordDialog
          employee={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </Stack>
  );
}
