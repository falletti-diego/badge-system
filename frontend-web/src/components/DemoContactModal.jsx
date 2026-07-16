import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Box,
} from '@mui/material';
import apiClient from '../services/apiClient';
import logger from '../utils/logger';
import { extractApiErrorMessage } from '../utils/apiError';

const MESSAGE_MAX_LENGTH = 2000;

/**
 * DemoContactModal (Task 8 of 9)
 *
 * Free-text "Parliamo" form for an active demo session. Calls
 * POST /demo/contact (requireAuth + requireDemoTenant on the backend — see
 * routes/demo.js), which is only reachable while the demo session is still
 * valid. On success, shows the confirmation copy from the plan verbatim
 * ("Messaggio inviato, ti ricontattiamo presto") and lets the user dismiss
 * the dialog themselves. On failure, the dialog stays open with an inline
 * error so the user can retry rather than losing their typed message.
 *
 * NOT reused by DemoExpiredPage: by the time that page is shown, the demo
 * session is dead (no valid token), so an authenticated call here would
 * always fail — see DemoExpiredPage.jsx for its own, unauthenticated CTA.
 */
export default function DemoContactModal({ open, onClose }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const resetTimeoutRef = useRef(null);

  // DemoBanner renders a single, persistent DemoContactModal instance whose
  // `open` prop toggles rather than remounting — so a stale reset timer from
  // a previous close must never be allowed to fire against a live, reopened
  // instance (code-review Fix 1: same setTimeout-leak bug class as Task 7's
  // TryDemoPage fix). Cancel any pending reset the moment the dialog reopens.
  useEffect(() => {
    if (open && resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, [open]);

  // Cancel any pending reset on unmount too (e.g. NavBar/DemoBanner
  // unmounting on a route change while a close animation is still pending).
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const handleClose = () => {
    if (loading) return;
    onClose();
    // Reset for next time the modal is opened, after the close animation.
    // Clear any previous pending reset first so rapid close/close cycles
    // don't stack multiple timers.
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(() => {
      setMessage('');
      setError(null);
      setSent(false);
      resetTimeoutRef.current = null;
    }, 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError('Scrivi un messaggio prima di inviare');
      return;
    }
    if (message.length > MESSAGE_MAX_LENGTH) {
      setError(`Il messaggio non può superare i ${MESSAGE_MAX_LENGTH} caratteri`);
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/v1/demo/contact', { message });
      setSent(true);
    } catch (err) {
      logger.error('DemoContactModal', 'contact submit failed', err);
      setError(extractApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Parliamo</DialogTitle>

      {sent ? (
        <>
          <DialogContent>
            <Alert severity="success">Messaggio inviato, ti ricontattiamo presto</Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Chiudi</Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              autoFocus
              label="Il tuo messaggio"
              placeholder="Raccontaci cosa ti serve, ti ricontattiamo noi"
              multiline
              minRows={4}
              fullWidth
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              inputProps={{ maxLength: MESSAGE_MAX_LENGTH }}
              helperText={`${message.length}/${MESSAGE_MAX_LENGTH}`}
            />
            {error && (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={loading}>
              Annulla
            </Button>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : 'Invia'}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}
