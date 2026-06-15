import React from 'react';
import {
  Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';

export function ConfirmDeleteDialog({ open, title, description, onConfirm, onCancel, loading }) {
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
