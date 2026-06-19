import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Chip, Stack, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import apiClient from '../../../services/apiClient';
import { useFetch } from '../components/useFetch';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';

export function ClientsTab() {
  const { data: clients, loading, error: fetchError, reload } = useFetch('/api/v1/admin/clients');
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
      await apiClient.post('/api/v1/admin/clients', form);
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
