import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Chip,
  Stack,
} from '@mui/material';

export const ManagerIllnessModal = ({ open, onClose, illness }) => {
  if (!illness) return null;

  const startDate = new Date(illness.start_date);
  const endDate = new Date(illness.end_date);
  const numDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: '#fef2f2',
          borderBottom: '1px solid #fee2e2',
        }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            bgcolor: '#DC2626',
            transform: 'rotate(45deg)',
          }}
        />
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111' }}>
          Comunicazione Malattia
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2.5}>
          {/* Employee Info */}
          <Box>
            <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
              DIPENDENTE
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#111' }}>
              {illness.employee_name}
            </Typography>
          </Box>

          {/* Dates */}
          <Box>
            <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
              PERIODO
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Typography variant="body2" sx={{ color: '#111' }}>
                {startDate.toLocaleDateString('it-IT')} →{' '}
                {endDate.toLocaleDateString('it-IT')}
              </Typography>
              <Chip
                label={`${numDays} ${numDays === 1 ? 'giorno' : 'giorni'}`}
                size="small"
                sx={{ backgroundColor: '#fee2e2', color: '#DC2626', fontWeight: 600 }}
              />
            </Stack>
          </Box>

          {/* Reason */}
          {illness.reason && (
            <Box>
              <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
                MOTIVO
              </Typography>
              <Typography variant="body2" sx={{ color: '#111', mt: 0.5 }}>
                {illness.reason}
              </Typography>
            </Box>
          )}

          {/* Certificate */}
          {illness.certificate_url && (
            <Box>
              <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
                CERTIFICATO
              </Typography>
              <Button
                variant="outlined"
                size="small"
                href={illness.certificate_url}
                target="_blank"
                sx={{
                  mt: 1,
                  borderColor: '#DC2626',
                  color: '#DC2626',
                  fontWeight: 600,
                  '&:hover': { backgroundColor: '#fef2f2' },
                }}
              >
                Visualizza Documento
              </Button>
            </Box>
          )}

          {/* Note */}
          <Box
            sx={{
              p: 2,
              backgroundColor: '#fef2f2',
              borderRadius: 1,
              borderLeft: '3px solid #DC2626',
            }}
          >
            <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
              ℹ️ INFORMAZIONE
            </Typography>
            <Typography variant="body2" sx={{ color: '#111', mt: 0.5 }}>
              Non è possibile assegnare turni durante questo periodo di malattia comunicata.
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained" sx={{ backgroundColor: '#DC2626' }}>
          Chiudi
        </Button>
      </DialogActions>
    </Dialog>
  );
};
