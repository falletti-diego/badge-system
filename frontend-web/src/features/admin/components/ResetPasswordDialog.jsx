import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, Typography,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { CopyButton } from './CopyButton';
import apiClient from '../../../services/apiClient';

export function ResetPasswordDialog({ employee, onClose }) {
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
