import React from 'react';
import {
  Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';

export function ConfirmSaveDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Annulla</Button>
        <Button onClick={onConfirm} variant="contained" disabled={loading} sx={{ backgroundColor: '#1E3A5F' }}>
          {loading ? <CircularProgress size={18} /> : 'Salva'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
