import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent,
  TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper,
  Select, MenuItem, FormControl, InputLabel, Chip, Stack,
  Divider, Tooltip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions,
  Switch, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockResetIcon from '@mui/icons-material/LockReset';
import MyLocationIcon from '@mui/icons-material/MyLocation';
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

function ResetPasswordDialog({ employee, onClose }) {
  const [loading, setLoading] = useState(false);
  const [newPwd, setNewPwd] = useState(null);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(`/api/admin/employees/${employee.id}/reset-password`);
      setNewPwd(res.data.temp_password);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!employee} onClose={newPwd ? onClose : undefined} maxWidth="xs" fullWidth>
      <DialogTitle>Reset password — {employee?.name}</DialogTitle>
      <DialogContent>
        {!newPwd ? (
          <>
            <DialogContentText>
              Verrà generata una nuova password temporanea per{' '}
              <strong>{employee?.email}</strong>.<br />
              La password attuale sarà immediatamente invalidata.
            </DialogContentText>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </>
        ) : (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Password reimpostata con successo. Comunica questa password al dipendente — non verrà mostrata di nuovo.
            </Alert>
            <Box display="flex" alignItems="center" gap={1} sx={{
              p: 1.5, borderRadius: 1, bgcolor: 'grey.100', fontFamily: 'monospace',
            }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '1rem', flexGrow: 1 }}>
                {newPwd}
              </Typography>
              <CopyButton text={newPwd} />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!newPwd ? (
          <>
            <Button onClick={onClose} disabled={loading}>Annulla</Button>
            <Button onClick={handleConfirm} variant="contained" color="warning" disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : <LockResetIcon />}>
              {loading ? 'Reset in corso…' : 'Reimposta Password'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} variant="contained">Chiudi</Button>
        )}
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

// ─── Tab: Consensi GPS ─────────────────────────────────────────────────────

function ConsentTab() {
  const { data: response, loading, error: fetchError, reload } = useFetch('/api/consent/admin/employee-consents');
  const [msg, setMsg] = useState(null);
  const data = response?.data || [];
  const summary = response?.summary || { total_employees: 0, consented: 0, pending: 0, consent_rate_percent: 0 };

  const handleNotifyPending = async () => {
    setMsg({ type: 'info', text: 'Notifica in corso...' });
    // Phase 2: Send email to pending employees
    // For now, just show a placeholder message
    setMsg({
      type: 'success',
      text: `${summary.pending} dipendenti in attesa verranno notificati (fase 2)`,
    });
    setTimeout(() => setMsg(null), 3000);
  };

  if (fetchError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{fetchError}</Alert>
      </Box>
    );
  }

  const consentedCount = summary.consented || 0;
  const pendingCount = summary.pending || 0;

  return (
    <Box>
      {msg && (
        <Alert
          severity={msg.type}
          onClose={() => setMsg(null)}
          sx={{ mb: 2 }}
        >
          {msg.text}
        </Alert>
      )}

      {/* Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Consensi GPS Totali
            </Typography>
            <Typography variant="h5">
              {summary.total_employees}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              ✅ Accettati
            </Typography>
            <Typography variant="h5" sx={{ color: 'success.main' }}>
              {consentedCount}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              ⏳ In Sospeso
            </Typography>
            <Typography variant="h5" sx={{ color: 'warning.main' }}>
              {pendingCount}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Tasso di Consenso
            </Typography>
            <Typography variant="h5" sx={{ color: 'info.main' }}>
              {summary.consent_rate_percent}%
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Action Buttons */}
      {pendingCount > 0 && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleNotifyPending}
            disabled={loading}
          >
            📧 Notifica Dipendenti In Sospeso ({pendingCount})
          </Button>
        </Box>
      )}

      {/* Consent Status Table */}
      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#F5F2ED' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Nome</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>GPS Consent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Data Accettazione</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Policy Version</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    Nessun dipendente trovato
                  </TableCell>
                </TableRow>
              ) : (
                data.map((emp) => (
                  <TableRow key={emp.id} sx={{ '&:hover': { backgroundColor: '#FAFAF8' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>{emp.name || '—'}</TableCell>
                    <TableCell>{emp.email}</TableCell>
                    <TableCell>
                      {emp.gps_consent_given ? (
                        <Chip label="✅ Accettato" size="small" color="success" />
                      ) : (
                        <Chip label="⏳ In sospeso" size="small" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.consent_accepted_at
                        ? new Date(emp.consent_accepted_at).toLocaleDateString('it-IT')
                        : '—'}
                    </TableCell>
                    <TableCell>{emp.privacy_policy_version || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
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

// ─── Geofence Dialog ────────────────────────────────────────────────────────

function GeofenceDialog({ site, clientGeofencingEnabled = true, onClose, onSaved }) {
  const [form, setForm] = useState({
    geofence_enabled: site.geofence_enabled || false,
    latitude: site.latitude != null ? String(site.latitude) : '',
    longitude: site.longitude != null ? String(site.longitude) : '',
    geofence_radius_meters: site.geofence_radius_meters || 150,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const lat = form.latitude !== '' ? parseFloat(form.latitude) : null;
      const lng = form.longitude !== '' ? parseFloat(form.longitude) : null;
      if (form.geofence_enabled && (lat == null || lng == null || isNaN(lat) || isNaN(lng))) {
        setMsg({ type: 'error', text: 'Inserisci latitudine e longitudine valide per attivare il geofencing.' });
        setSaving(false);
        return;
      }
      await apiClient.put(`/api/admin/sites/${site.id}`, {
        latitude: lat,
        longitude: lng,
        geofence_radius_meters: Number(form.geofence_radius_meters),
        geofence_enabled: form.geofence_enabled,
      });
      setMsg({ type: 'success', text: 'Geofencing aggiornato.' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  const mapsUrl = form.latitude && form.longitude
    ? `https://maps.google.com/?q=${form.latitude},${form.longitude}`
    : null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>📍 Geofencing — {site.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.geofence_enabled}
                onChange={(e) => setForm({ ...form, geofence_enabled: e.target.checked })}
                disabled={!clientGeofencingEnabled}
              />
            }
            label={!clientGeofencingEnabled ? 'Geofencing disabilitato' : 'Geofencing attivo'}
          />
          {!clientGeofencingEnabled && (
            <Alert severity="info">
              Geofencing è disattivato a livello cliente. Abilita il geofencing nelle Impostazioni per attivarlo per questa sede.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Latitudine"
              size="small"
              fullWidth
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              placeholder="es. 45.4654"
              disabled={!clientGeofencingEnabled || !form.geofence_enabled}
              type="number"
              inputProps={{ step: 'any' }}
            />
            <TextField
              label="Longitudine"
              size="small"
              fullWidth
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              placeholder="es. 9.1859"
              disabled={!clientGeofencingEnabled || !form.geofence_enabled}
              type="number"
              inputProps={{ step: 'any' }}
            />
          </Stack>
          <TextField
            label="Raggio (metri)"
            size="small"
            type="number"
            value={form.geofence_radius_meters}
            onChange={(e) => setForm({ ...form, geofence_radius_meters: e.target.value })}
            inputProps={{ min: 50, max: 5000, step: 10 }}
            disabled={!clientGeofencingEnabled || !form.geofence_enabled}
            helperText="Min 50m — Max 5000m. Consigliato: 100-200m."
          />
          {mapsUrl && (
            <Typography variant="caption">
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                📍 Verifica posizione su Google Maps
              </a>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Suggerimento: apri Google Maps, fai click sulla sede e copia le coordinate.
          </Typography>
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Annulla</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ backgroundColor: '#1E3A5F' }}>
          {saving ? <CircularProgress size={18} /> : 'Salva'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Tab: Sedi ─────────────────────────────────────────────────────────────

function SitesTab() {
  const { data: clients } = useFetch('/api/admin/clients');
  const [selectedClient, setSelectedClient] = useState('');

  // clientGeofencingEnabled is determined by the currently selected/filtered client
  const selectedClientObj = selectedClient
    ? clients.find(c => c.id === selectedClient)
    : (clients.length > 0 ? clients[0] : null);
  const clientGeofencingEnabled = selectedClientObj
    ? selectedClientObj.geofencing_feature_enabled !== false
    : true;

  const { data: sites, loading, error: fetchError, reload } = useFetch(
    selectedClient ? `/api/admin/sites?client_id=${selectedClient}` : '/api/admin/sites'
  );
  const [form, setForm] = useState({ client_id: '', name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [geofenceTarget, setGeofenceTarget] = useState(null);

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
                    <TableCell>Geofencing</TableCell>
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
                      <TableCell>
                        {s.geofencing_feature_enabled ? (
                          <>
                            <Tooltip title="Configura geofencing">
                              <IconButton size="small" onClick={() => setGeofenceTarget(s)}
                                sx={{ color: s.geofence_enabled ? '#2D7049' : '#9E9E9E' }}>
                                <MyLocationIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {s.geofence_enabled && (
                              <Chip label={`${s.geofence_radius_meters}m`} size="small" color="success" variant="outlined" />
                            )}
                          </>
                        ) : (
                          <Tooltip title="Geofencing disabilitato nelle impostazioni">
                            <span>
                              <IconButton size="small" disabled>
                                <MyLocationIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
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
                    <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>Nessuna sede</TableCell></TableRow>
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

      {geofenceTarget && (
        <GeofenceDialog
          site={geofenceTarget}
          clientGeofencingEnabled={geofenceTarget.geofencing_feature_enabled !== false}
          onClose={() => setGeofenceTarget(null)}
          onSaved={() => { setGeofenceTarget(null); reload(); }}
        />
      )}
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

// ─── Tab: Commercialisti ───────────────────────────────────────────────────

function ViewersTab() {
  const { data: clients } = useFetch('/api/admin/clients');
  const [filterClient, setFilterClient] = useState('');
  const { data: viewers, loading, error: fetchError, reload } = useFetch(
    filterClient ? `/api/admin/viewers?client_id=${filterClient}` : '/api/admin/viewers'
  );
  const [form, setForm] = useState({ client_id: '', email: '', name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/employees/${deleteTarget.id}`);
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
      const payload = {
        client_id: form.client_id,
        email: form.email,
        name: form.name,
        ...(form.password && { password: form.password }),
      };
      const res = await apiClient.post('/api/admin/viewers', payload);
      const viewer = res.data.data;
      const tempPwd = res.data.temp_password;
      setMsg({ type: 'success', text: `Commercialista "${viewer.name}" aggiunto.`, tempPwd });
      setForm({ ...form, email: '', name: '', password: '' });
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
          <Typography variant="h6" gutterBottom>Aggiungi Commercialista</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Il commercialista può visualizzare le presenze ed esportare in formato Zucchetti o TeamSystem. Non ha accesso a correzioni, planning o admin.
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl size="small" required sx={{ minWidth: 180 }}>
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    label="Cliente" value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
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
                <TextField
                  label="Password (opzionale)" type="password" fullWidth size="small"
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
                      <Box component="code" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.08)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                  {saving ? <CircularProgress size={18} /> : 'Aggiungi Commercialista'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Commercialisti ({viewers.length})</Typography>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filtra cliente</InputLabel>
              <Select label="Filtra cliente" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
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
                    <TableCell>Email</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Creato</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewers.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.email}</TableCell>
                      <TableCell>{v.client_name}</TableCell>
                      <TableCell>{new Date(v.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Rimuovi accesso">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(v)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {viewers.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>Nessun commercialista</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Rimuovi accesso a "${deleteTarget?.name}"?`}
        description="Il commercialista non potrà più accedere al sistema. L'operazione è irreversibile."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Stack>
  );
}

// ─── Tab: Impostazioni ────────────────────────────────────────────────────────

function SettingsTab() {
  const [mealHours, setMealHours] = useState('');
  const [geofencingEnabled, setGeofencingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [msg, setMsg] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Load client from JWT client_id
  const user = authService.getUser();
  const clientId = user?.client_id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/api/admin/clients');
        if (!cancelled && res.data.data && res.data.data.length > 0) {
          const client = res.data.data.find(c => c.id === clientId) || res.data.data[0];
          setMealHours(client.meal_voucher_hours !== undefined && client.meal_voucher_hours !== null
            ? String(client.meal_voucher_hours) : '5');
          setGeofencingEnabled(client.geofencing_feature_enabled !== false);
        }
      } catch {
        // ignore — user can still type in the field
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handleSave = () => {
    setConfirmDialog(true);
  };

  const handleConfirmSave = async () => {
    const parsed = parseFloat(mealHours);
    if (isNaN(parsed) || parsed < 0 || parsed > 24) {
      setMsg({ type: 'error', text: 'Inserisci un valore tra 0 e 24 ore.' });
      setConfirmDialog(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      await apiClient.put('/api/admin/settings', {
        meal_voucher_hours: parsed,
        geofencing_feature_enabled: geofencingEnabled,
      });
      setMsg({ type: 'success', text: 'Impostazioni salvate.' });
      setConfirmDialog(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setConfirmDialog(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        {fetching ? (
          <CircularProgress size={24} />
        ) : (
          <>
            {/* GEOFENCING SECTION (FIRST) */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={1}>📍 Geofencing</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Se attivo, i dipendenti possono effettuare il check-in solo quando si trovano
                fisicamente nelle vicinanze della sede (configurabile per ogni sede).
                Se disattivato, il controllo GPS viene ignorato per tutte le sedi.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={geofencingEnabled}
                    onChange={(e) => setGeofencingEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label={geofencingEnabled ? 'Geofencing attivo' : 'Geofencing disattivato'}
              />
              {!geofencingEnabled && (
                <Alert severity="info" sx={{ mt: 1, maxWidth: 500 }}>
                  Il controllo GPS è disabilitato. I dipendenti possono fare check-in da qualsiasi posizione.
                </Alert>
              )}
            </Box>

            {/* MEAL VOUCHERS SECTION (SECOND) */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={1}>📋 Buoni Pasto</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Il sistema assegna automaticamente un buono pasto per ogni giornata in cui il dipendente
                lavora almeno il numero di ore configurato qui.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, maxWidth: 400 }}>
                <TextField
                  label="Ore minime per buono pasto"
                  type="number"
                  value={mealHours}
                  onChange={(e) => setMealHours(e.target.value)}
                  inputProps={{ min: 0, max: 24, step: 0.5 }}
                  size="small"
                  helperText="Es: 5 = buono pasto se ≥ 5h lavorate"
                  sx={{ flexGrow: 1 }}
                />
              </Box>
            </Box>

            {/* SAVE BUTTON */}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading}
              sx={{ backgroundColor: '#1E3A5F', mt: 2 }}
            >
              {loading ? <CircularProgress size={18} /> : 'Salva'}
            </Button>
          </>
        )}

        {msg && <Alert severity={msg.type} sx={{ mt: 2, maxWidth: 500 }}>{msg.text}</Alert>}

        {/* CONFIRMATION DIALOG */}
        <ConfirmDeleteDialog
          open={confirmDialog}
          title="Conferma salvataggio"
          description="Vuoi salvare le modifiche?"
          onConfirm={handleConfirmSave}
          onCancel={() => setConfirmDialog(false)}
          loading={loading}
        />
      </CardContent>
    </Card>
  );
}

// ─── Main AdminPage ─────────────────────────────────────────────────────────

export function AdminPage() {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();
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
        Gestisci clienti, sedi, dipendenti e accessi commercialisti.
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Clienti" />
        <Tab label="Sedi" />
        <Tab label="Dipendenti" />
        <Tab label="Commercialisti" />
        <Tab label="Impostazioni" />
        <Tab label="Consensi GPS" />
      </Tabs>

      {tab === 0 && <ClientsTab />}
      {tab === 1 && <SitesTab />}
      {tab === 2 && <EmployeesTab />}
      {tab === 3 && <ViewersTab />}
      {tab === 4 && <SettingsTab />}
      {tab === 5 && <ConsentTab />}
    </Box>
  );
}
