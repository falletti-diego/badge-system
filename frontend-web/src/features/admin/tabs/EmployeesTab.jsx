import React, { useState, useRef } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Chip, Stack, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import apiClient from '../../../services/apiClient';
import { useFetch } from '../components/useFetch';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import { CopyButton } from '../components/CopyButton';

export function EmployeesTab() {
  const { data: clients } = useFetch('/api/admin/clients');
  const { data: allSites } = useFetch('/api/admin/sites');
  const [filterClient, setFilterClient] = useState('');
  const { data: employees, loading: empLoading, reload: reloadEmployees } = useFetch(
    filterClient ? `/api/admin/employees?client_id=${filterClient}` : '/api/admin/employees'
  );
  const [form, setForm] = useState({
    client_id: '', email: '', name: '', phone: '',
    role: 'employee', site_id: '', password: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [csvMsg, setCsvMsg] = useState(null);
  const [csvClientId, setCsvClientId] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const fileRef = useRef(null);
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
        ...(form.site_id && { site_id: form.site_id }),
        ...(form.password && { password: form.password }),
      };
      const res = await apiClient.post('/api/admin/employees', payload);
      const emp = res.data.data;
      const tempPwd = res.data.temp_password;
      setMsg({
        type: 'success',
        text: `Dipendente "${emp.name}" creato con successo.`,
        tempPwd,
      });
      setForm({ ...form, email: '', name: '', phone: '', site_id: '', password: '' });
      reloadEmployees();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !csvClientId) return;
    setCsvLoading(true);
    setCsvMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('client_id', csvClientId);
      const res = await apiClient.post('/api/admin/employees/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { created, skipped, errors } = res.data.data;
      setCsvMsg({
        type: errors.length > 0 ? 'warning' : 'success',
        text: `Importati: ${created} | Duplicati saltati: ${skipped} | Errori: ${errors.length}`,
        errors,
      });
    } catch (err) {
      setCsvMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setCsvLoading(false);
      if (fileRef.current) fileRef.current.value = '';
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
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    label="Cliente" value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: '' })}
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
                  <InputLabel>Ruolo</InputLabel>
                  <Select label="Ruolo" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <MenuItem value="employee">Dipendente</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                  </Select>
                </FormControl>
                {form.role === 'manager' && (
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Sede gestita</InputLabel>
                    <Select
                      label="Sede gestita" value={form.site_id}
                      onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                    >
                      <MenuItem value="">— nessuna —</MenuItem>
                      {clientSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  label="Password (opzionale, auto se vuota)" fullWidth size="small" type="password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  helperText="Lascia vuoto per generare automaticamente"
                />
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
                  disabled={saving || !form.client_id}>
                  {saving ? <CircularProgress size={18} /> : 'Crea Dipendente'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* CSV bulk import */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Importazione CSV</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Formato CSV: <code>name,email,role,site_name,employee_id</code>
            <br />
            Obbligatorie: <code>name</code>, <code>email</code>. Max 100 righe.
            <br />
            <code>site_name</code>: nome della sede (es. <em>Torino Store</em>) — deve esistere già nel sistema.
            <br />
            <code>employee_id</code>: codice interno del cliente (es. <em>EMP001</em>) — opzionale.
            <br />
            <code>role</code>: <code>employee</code> (default) oppure <code>manager</code>.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <FormControl size="small" required sx={{ minWidth: 200 }}>
              <InputLabel>Cliente</InputLabel>
              <Select label="Cliente" value={csvClientId} onChange={(e) => setCsvClientId(e.target.value)}>
                {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button
              variant="outlined" component="label" startIcon={<UploadFileIcon />}
              disabled={csvLoading || !csvClientId}
            >
              {csvLoading ? <CircularProgress size={18} /> : 'Carica CSV'}
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={handleCsvUpload} />
            </Button>
          </Stack>
          {csvMsg && (
            <Box mt={2}>
              <Alert severity={csvMsg.type}>{csvMsg.text}</Alert>
              {csvMsg.errors?.length > 0 && (
                <Box mt={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {csvMsg.errors.map((err, i) => (
                    <Typography key={i} variant="caption" display="block" color="error">
                      Riga {err.line}: {err.email} — {err.error}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
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
                        <Tooltip title="Elimina dipendente">
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
        title={`Elimina dipendente "${deleteTarget?.name}"?`}
        description="Questa azione eliminerà anche tutti i check-in registrati da questo dipendente. L'operazione è irreversibile."
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
