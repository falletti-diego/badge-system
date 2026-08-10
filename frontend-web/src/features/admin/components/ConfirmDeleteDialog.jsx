import React from 'react';
import {
  Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';

export function ConfirmDeleteDialog({
  open, title, description, onConfirm, onCancel, loading,
  confirmLabel = 'Elimina', confirmColor = 'error',
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Annulla</Button>
        <Button onClick={onConfirm} color={confirmColor} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={18} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
