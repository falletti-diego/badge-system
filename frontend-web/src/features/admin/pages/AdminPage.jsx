import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent,
  TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Select, MenuItem, FormControl, InputLabel, Chip, Stack,
  Divider, Tooltip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../services/apiClient';
import authService from '../../../services/authService';

// ─── Helpers ───────────────────────────────────────────────────────────────

function useFetch(url) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const load = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(url, { signal: abortRef.current.signal });
      setData(res.data.data || []);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload: load };
}

function ConfirmDeleteDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Annulla</Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={18} /> : 'Elimina'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip title={copied ? 'Copiato!' : 'Copia'}>
      <IconButton size="small" onClick={handle}>
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

// ─── Tab: Clienti ──────────────────────────────────────────────────────────

function ClientsTab() {
  const { data: clients, loading, error: fetchError, reload } = useFetch('/api/admin/clients');
  const [form, setForm] = useState({ name: '', email: '', plan: 'starter' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/clients/${deleteTarget.id}`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.post('/api/admin/clients', form);
      setMsg({ type: 'success', text: `Cliente "${form.name}" creato.` });
      setForm({ name: '', email: '', plan: 'starter' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Nuovo Cliente</Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Nome azienda" required fullWidth size="small"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <TextField
                  label="Email" type="email" required fullWidth size="small"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Piano</InputLabel>
                  <Select label="Piano" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                    <MenuItem value="starter">Starter</MenuItem>
                    <MenuItem value="growth">Growth</MenuItem>
                    <MenuItem value="enterprise">Enterprise</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
              <Box>
                <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={saving}>
                  {saving ? <CircularProgress size={18} /> : 'Crea Cliente'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Clienti ({clients.length})</Typography>
          {fetchError && <Alert severity="error" sx={{ mb: 2 }}>{fetchError}</Alert>}
          {loading ? <CircularProgress size={24} /> : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Piano</TableCell>
                    <TableCell align="center">Sedi</TableCell>
                    <TableCell align="center">Dipendenti</TableCell>
                    <TableCell>Creato</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell><Chip label={c.plan} size="small" /></TableCell>
                      <TableCell align="center">{c.site_count}</TableCell>
                      <TableCell align="center">{c.employee_count}</TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Elimina cliente">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(c)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {clients.length === 0 && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>Nessun cliente</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Elimina cliente "${deleteTarget?.name}"?`}
        description={`Questa azione eliminerà anche tutte le sedi, i dipendenti e i check-in associati. L'operazione è irreversibile.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Stack>
  );
}

// ─── Tab: Sedi ─────────────────────────────────────────────────────────────

function SitesTab() {
  const { data: clients } = useFetch('/api/admin/clients');
  const [selectedClient, setSelectedClient] = useState('');
  const { data: sites, loading, error: fetchError, reload } = useFetch(
    selectedClient ? `/api/admin/sites?client_id=${selectedClient}` : '/api/admin/sites'
  );
  const [form, setForm] = useState({ client_id: '', name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/sites/${deleteTarget.id}`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/api/admin/sites', form);
      setMsg({ type: 'success', text: `Sede "${form.name}" creata. QR: ${res.data.data.qr_code_content}` });
      setForm({ ...form, name: '', location: '' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Nuova Sede</Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl size="small" required sx={{ minWidth: 200 }}>
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    label="Cliente" value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  >
                    {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Nome sede" required fullWidth size="small"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <TextField
                  label="Indirizzo" fullWidth size="small"
                  value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Stack>
              {msg && <Alert severity={msg.type} sx={{ wordBreak: 'break-all' }}>{msg.text}</Alert>}
              <Box>
                <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={saving || !form.client_id}>
                  {saving ? <CircularProgress size={18} /> : 'Crea Sede'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Sedi ({sites.length})</Typography>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filtra cliente</InputLabel>
              <Select label="Filtra cliente" value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
                <MenuItem value="">Tutti</MenuItem>
                {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          {fetchError && <Alert severity="error" sx={{ mb: 2 }}>{fetchError}</Alert>}
          {loading ? <CircularProgress size={24} /> : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Indirizzo</TableCell>
                    <TableCell>QR Code Content</TableCell>
                    <TableCell>Creato</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sites.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.client_name}</TableCell>
                      <TableCell>{s.location || '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 250 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="caption" sx={{ wordBreak: 'break-all', fontSize: '0.7rem' }}>
                            {s.qr_code_content}
                          </Typography>
                          <CopyButton text={s.qr_code_content} />
                        </Stack>
                      </TableCell>
                      <TableCell>{new Date(s.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Elimina sede">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(s)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sites.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>Nessuna sede</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Elimina sede "${deleteTarget?.name}"?`}
        description="Questa azione eliminerà tutti i check-in associati a questa sede. L'operazione è irreversibile."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Stack>
  );
}

// ─── Tab: Dipendenti ────────────────────────────────────────────────────────

function EmployeesTab() {
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
            Formato CSV: <code>name,email,phone,role,site_id,assigned_sites</code>
            <br />
            Colonne obbligatorie: <code>name</code>, <code>email</code>. Max 500 righe.
            <br />
            <code>assigned_sites</code>: UUID separati da <code>;</code>
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
                      <TableCell>{e.client_name}</TableCell>
                      <TableCell>{e.site_name || '—'}</TableCell>
                      <TableCell>{new Date(e.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="right">
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
    </Stack>
  );
}

// ─── Main AdminPage ─────────────────────────────────────────────────────────

export function AdminPage() {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();
  const user = authService.getUser();

  if (user?.role !== 'admin') {
    return (
      <Box p={4}>
        <Alert severity="error">Accesso negato — solo amministratori.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={1}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard')}
          variant="outlined"
          size="small"
        >
          Dashboard
        </Button>
        <Typography variant="h3">Pannello Admin</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Gestisci clienti, sedi e dipendenti del sistema Badge.
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Clienti" />
        <Tab label="Sedi" />
        <Tab label="Dipendenti" />
      </Tabs>

      {tab === 0 && <ClientsTab />}
      {tab === 1 && <SitesTab />}
      {tab === 2 && <EmployeesTab />}
    </Box>
  );
}
