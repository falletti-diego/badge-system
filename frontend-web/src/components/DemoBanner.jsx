import { useState } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import apiClient from '../services/apiClient';
import authService from '../services/authService';
import logger from '../utils/logger';
import { extractApiErrorMessage } from '../utils/apiError';
import DemoContactModal from './DemoContactModal';

const ROLES = [
  { value: 'admin', label: 'Guarda come Admin' },
  { value: 'manager', label: 'Guarda come Manager' },
  { value: 'employee', label: 'Guarda come Dipendente' },
];

/**
 * DemoBanner (Task 8 of 9)
 *
 * Persistent strip shown only for an active demo session
 * (authService.isDemo()). Mounted once from NavBar.jsx (as a sibling of
 * <AppBar>/<Popover>, not nested inside them) so it appears on every
 * protected page for free, without touching each page file individually.
 *
 * Role-switch buttons call POST /demo/switch-role, persist the new session
 * via authService.setSession(...), then do a HARD reload
 * (window.location.href, not react-router's navigate()) — useAuth() only
 * reads localStorage once on mount with an empty dependency array, so nothing
 * already mounted (NavBar, ProtectedRoute, DashboardPage...) would notice a
 * role change without a real page load. See plan Task 8 notes.
 */
export default function DemoBanner() {
  const [switching, setSwitching] = useState(null); // which role is in flight, or null
  const [switchError, setSwitchError] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  if (!authService.isDemo()) return null;

  const daysRemaining = authService.getDemoDaysRemaining();

  const handleSwitchRole = async (role) => {
    setSwitchError(null);
    setSwitching(role);
    try {
      const response = await apiClient.post('/api/v1/demo/switch-role', { role });
      authService.setSession(response.data.data);
      window.location.href = '/dashboard';
    } catch (err) {
      logger.error('DemoBanner', 'switch-role failed', err);
      setSwitching(null);
      setSwitchError(extractApiErrorMessage(err, 'Non è stato possibile cambiare ruolo — riprova.'));
    }
  };

  return (
    <>
      <Box
        sx={{
          bgcolor: 'var(--color-gold-500, #C9A227)',
          color: 'var(--color-navy-900, #1E3A5F)',
          px: 2,
          py: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          justifyContent: 'space-between',
        }}
        data-testid="demo-banner"
      >
        <Typography sx={{ fontSize: '13px', fontWeight: 700 }}>
          Modalità demo
          {daysRemaining !== null && (
            <> — {daysRemaining} {daysRemaining === 1 ? 'giorno rimanente' : 'giorni rimanenti'}</>
          )}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {ROLES.map((r) => (
            <Button
              key={r.value}
              size="small"
              variant="outlined"
              disabled={switching !== null}
              onClick={() => handleSwitchRole(r.value)}
              sx={{
                textTransform: 'none',
                fontSize: '12px',
                borderColor: 'var(--color-navy-900, #1E3A5F)',
                color: 'var(--color-navy-900, #1E3A5F)',
              }}
            >
              {switching === r.value ? '...' : r.label}
            </Button>
          ))}
          <Button
            size="small"
            variant="contained"
            onClick={() => setContactOpen(true)}
            sx={{
              textTransform: 'none',
              fontSize: '12px',
              bgcolor: 'var(--color-navy-900, #1E3A5F)',
              '&:hover': { bgcolor: 'var(--color-navy-900, #1E3A5F)', opacity: 0.9 },
            }}
          >
            Parliamo
          </Button>
        </Stack>

        {switchError && (
          <Typography sx={{ fontSize: '12px', color: '#C0392B', width: '100%' }}>{switchError}</Typography>
        )}
      </Box>

      <DemoContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
