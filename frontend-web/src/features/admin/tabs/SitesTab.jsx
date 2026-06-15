import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Chip, Stack, Tooltip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Switch, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import apiClient from '../../../services/apiClient';
import { useFetch } from '../components/useFetch';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ConfirmSaveDialog } from '../components/ConfirmSaveDialog';
import { CopyButton } from '../components/CopyButton';

function GeofenceDialog({ site, clientGeofencingEnabled = true, onClose, onSaved }) {
  const [form, setForm] = useState({
    geofence_enabled: site.geofence_enabled || false,
    latitude: site.latitude != null ? String(site.latitude) : '',
    longitude: site.longitude != null ? String(site.longitude) : '',
    geofence_radius_meters: site.geofence_radius_meters || 150,
  });
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSaveClick = () => {
    const lat = form.latitude !== '' ? parseFloat(form.latitude) : null;
    const lng = form.longitude !== '' ? parseFloat(form.longitude) : null;
    if (form.geofence_enabled && (lat == null || lng == null || isNaN(lat) || isNaN(lng))) {
      setMsg({ type: 'error', text: 'Inserisci latitudine e longitudine valide per attivare il geofencing.' });
      return;
    }
    setConfirmSave(true);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const lat = form.latitude !== '' ? parseFloat(form.latitude) : null;
      const lng = form.longitude !== '' ? parseFloat(form.longitude) : null;
      await apiClient.put(`/api/admin/sites/${site.id}`, {
        latitude: lat,
        longitude: lng,
        geofence_radius_meters: Number(form.geofence_radius_meters),
        geofence_enabled: form.geofence_enabled,
      });
      setMsg({ type: 'success', text: 'Geofencing aggiornato.' });
      setConfirmSave(false);
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setConfirmSave(false);
    } finally {
      setSaving(false);
    }
  };

  const mapsUrl = form.latitude && form.longitude
    ? `https://maps.google.com/?q=${form.latitude},${form.longitude}`
    : null;

  return (
    <>
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
          <Button variant="contained" onClick={handleSaveClick} disabled={saving} sx={{ backgroundColor: '#1E3A5F' }}>
            {saving ? <CircularProgress size={18} /> : 'Salva'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmSaveDialog
        open={confirmSave}
        title="Salvare configurazione geofencing?"
        description={`Stai per salvare la configurazione di geofencing per ${site.name}. ${form.geofence_enabled ? 'Il geofencing sarà attivo con raggio ' + form.geofence_radius_meters + 'm.' : 'Il geofencing sarà disattivo.'}`}
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmSave(false)}
        loading={saving}
      />
    </>
  );
}

export function SitesTab() {
  const { data: clients } = useFetch('/api/admin/clients');
  const [selectedClient, setSelectedClient] = useState('');

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
