import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import apiClient from '../../../services/apiClient';

export const EmployeeIllnessReport = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    startDate: null,
    endDate: null,
    reason: '',
    certificateFile: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        start_date: formData.startDate,
        end_date: formData.endDate,
        reason: formData.reason || null,
      };

      const response = await apiClient.post('/api/v1/illnesses/report', payload);

      if (response.status === 201) {
        setSuccess(true);
        setFormData({ startDate: null, endDate: null, reason: '', certificateFile: null });
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Errore nella comunicazione della malattia';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 6, px: 2 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                bgcolor: '#DC2626',
                transform: 'rotate(45deg)',
              }}
            />
            <Typography variant="h2" sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#111' }}>
              Comunica Malattia
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ color: '#666', fontSize: '1.1rem' }}>
            Informa la tua assenza per motivi di salute
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            ✓ Comunicazione inviata con successo. Reindirizzamento in corso...
          </Alert>
        )}

        {/* Form Card */}
        <Card
          sx={{
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            border: '1px solid #f0f0f0',
            borderRadius: 2,
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3.5}>
                {/* Date Range Section */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: '#111' }}>
                    Periodo di Malattia
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <TextField
                      type="date"
                      label="Data Inizio"
                      value={formData.startDate || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                      fullWidth
                      required
                      InputLabelProps={{ shrink: true }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderColor: '#DC2626',
                          '&:hover fieldset': { borderColor: '#DC2626' },
                          '&.Mui-focused fieldset': { borderColor: '#DC2626' },
                        },
                      }}
                    />
                    <TextField
                      type="date"
                      label="Data Fine"
                      value={formData.endDate || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                      fullWidth
                      required
                      InputLabelProps={{ shrink: true }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderColor: '#DC2626',
                          '&:hover fieldset': { borderColor: '#DC2626' },
                          '&.Mui-focused fieldset': { borderColor: '#DC2626' },
                        },
                      }}
                    />
                  </Stack>
                </Box>

                {/* Reason Section */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: '#111' }}>
                    Motivo (Opzionale)
                  </Typography>
                  <TextField
                    label="Es: Febbre, Visita medica, Influenza"
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, reason: e.target.value }))
                    }
                    multiline
                    rows={3}
                    fullWidth
                    placeholder="Descrivi brevemente il motivo della malattia..."
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderColor: '#DC2626',
                        '&:hover fieldset': { borderColor: '#DC2626' },
                        '&.Mui-focused fieldset': { borderColor: '#DC2626' },
                      },
                    }}
                  />
                </Box>

                {/* Certificate Section (MVP: Optional) */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: '#111' }}>
                    Certificato Medico (Opzionale - MVP)
                  </Typography>
                  <Box
                    sx={{
                      p: 3,
                      border: '2px dashed #DC2626',
                      borderRadius: 1,
                      textAlign: 'center',
                      backgroundColor: 'rgba(220, 38, 38, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        backgroundColor: 'rgba(220, 38, 38, 0.05)',
                        borderColor: '#991b1b',
                      },
                    }}
                  >
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, certificateFile: e.target.files?.[0] }))
                      }
                      style={{ display: 'none' }}
                      id="cert-upload"
                    />
                    <label htmlFor="cert-upload" style={{ display: 'block', cursor: 'pointer' }}>
                      {formData.certificateFile ? (
                        <Typography variant="body2" sx={{ color: '#DC2626', fontWeight: 600 }}>
                          ✓ {formData.certificateFile.name}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                            Carica certificato medico (PDF, JPG, PNG)
                          </Typography>
                          <Button
                            variant="contained"
                            size="small"
                            sx={{
                              backgroundColor: '#DC2626',
                              '&:hover': { backgroundColor: '#991b1b' },
                            }}
                          >
                            Scegli File
                          </Button>
                        </>
                      )}
                    </label>
                  </Box>
                </Box>

                {/* Action Buttons */}
                <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={!formData.startDate || !formData.endDate || loading}
                    sx={{
                      backgroundColor: '#DC2626',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '1rem',
                      py: 1.5,
                      '&:hover': { backgroundColor: '#991b1b' },
                      '&:disabled': { backgroundColor: '#ccc' },
                      flex: 1,
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Comunica Malattia'}
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => navigate('/dashboard')}
                    disabled={loading}
                    sx={{ fontWeight: 600, color: '#666' }}
                  >
                    Annulla
                  </Button>
                </Stack>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};
