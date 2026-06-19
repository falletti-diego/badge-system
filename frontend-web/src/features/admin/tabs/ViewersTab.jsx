import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Stack, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import apiClient from '../../../services/apiClient';
import { useFetch } from '../components/useFetch';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { CopyButton } from '../components/CopyButton';

export function ViewersTab() {
  const { data: clients } = useFetch('/api/v1/admin/clients');
  const [filterClient, setFilterClient] = useState('');
  const { data: viewers, loading, error: fetchError, reload } = useFetch(
    filterClient ? `/api/admin/viewers?client_id=${filterClient}` : '/api/v1/admin/viewers'
  );
  const [form, setForm] = useState({ client_id: '', email: '', name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/viewers/${deleteTarget.id}`);
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
      const res = await apiClient.post('/api/v1/admin/viewers', payload);
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
