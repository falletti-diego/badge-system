import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Stack, Typography, Chip, CircularProgress, Alert,
  Paper, Divider, Badge,
} from '@mui/material';
import { useEvents } from '../hooks/useEvents';

export const ManagerEventApprovalPanel = () => {
  const { getPendingRequests, approveRequest, rejectRequest, loading, error } = useEvents();

  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const data = await getPendingRequests();
      setPendingRequests(data || []);
    } catch (err) {
      // Error is handled by hook
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleApprove = async (requestId) => {
    setActionInProgress(requestId);
    try {
      await approveRequest(requestId);
      setSuccessMessage('Richiesta approvata con successo');
      await loadRequests();
    } catch (err) {
      // Error is shown below
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectClick = (request) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedRequest) return;
    setActionInProgress(selectedRequest.id);
    try {
      await rejectRequest(selectedRequest.id, rejectionReason);
      setSuccessMessage('Richiesta rifiutata');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason('');
      await loadRequests();
    } catch (err) {
      // Error is shown below
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCloseRejectDialog = () => {
    setRejectDialogOpen(false);
    setSelectedRequest(null);
    setRejectionReason('');
  };

  return (
    <Card sx={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Richieste Eventi/Training in Sospeso
            </Typography>
            {pendingRequests.length > 0 && (
              <Badge badgeContent={pendingRequests.length} color="warning">
                <Box />
              </Badge>
            )}
          </Box>
        }
      />
      <Divider />
      <CardContent>
        {loadingRequests ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : pendingRequests.length === 0 ? (
          <Alert severity="success">Nessuna richiesta in sospeso</Alert>
        ) : (
          <Stack spacing={2}>
            {pendingRequests.map((request) => (
              <Paper
                key={request.id}
                sx={{ p: 2, backgroundColor: '#F9F7F3', border: '1px solid #E8DFD5', borderRadius: 1 }}
              >
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {request.employee_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B625A' }}>
                        {new Date(request.event_date).toLocaleDateString('it-IT')}
                        {' · '}{request.start_time?.slice(0, 5)} - {request.end_time?.slice(0, 5)}
                      </Typography>
                    </Box>
                    <Chip label="PENDING" size="small" color="warning" variant="filled" />
                  </Box>

                  {request.description && (
                    <Box sx={{ backgroundColor: '#FFF', p: 1, borderRadius: 0.5 }}>
                      <Typography variant="caption" sx={{ color: '#6B625A' }}>
                        <strong>Descrizione:</strong> {request.description}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      sx={{
                        backgroundColor: '#2D7049',
                        '&:hover': { backgroundColor: '#215a37' },
                        '&:disabled': { backgroundColor: '#ccc' },
                      }}
                      onClick={() => handleApprove(request.id)}
                      disabled={actionInProgress === request.id || loading}
                    >
                      {actionInProgress === request.id ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Approva'}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={() => handleRejectClick(request)}
                      disabled={actionInProgress === request.id || loading}
                    >
                      Rifiuta
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </CardContent>

      <Dialog open={rejectDialogOpen} onClose={handleCloseRejectDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Rifiuta Richiesta</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            label="Motivo del rifiuto (opzionale)"
            placeholder="Inserisci il motivo..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            helperText={`${rejectionReason.length}/500`}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRejectDialog}>Annulla</Button>
          <Button onClick={handleRejectConfirm} variant="contained" color="error" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Rifiuta'}
          </Button>
        </DialogActions>
      </Dialog>

      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mt: 2 }}>
          {successMessage}
        </Alert>
      )}
    </Card>
  );
};
