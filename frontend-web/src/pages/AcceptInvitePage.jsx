import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const validateForm = () => {
    const errors = {};
    if (!name || name.trim().length < 2) errors.name = 'Il nome è obbligatorio';
    if (!password || password.length < 8) errors.password = 'La password è obbligatoria (minimo 8 caratteri)';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post(
        `/api/v1/onboarding/invite/${token}/accept`,
        { name, password }
      );
      authService.setSession(response.data.data);
      navigate('/admin/onboarding');
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Invito non valido o scaduto. Contatta chi te lo ha inviato.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 3,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h4" sx={{ fontFamily: 'Cormorant Garamond', fontWeight: 600, color: '#1E3A5F', mb: 1 }}>
            Benvenuto su Badge System
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Imposta il tuo nome e la tua password per iniziare
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Nome"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validationErrors.name) setValidationErrors({ ...validationErrors, name: null });
            }}
            error={!!validationErrors.name}
            helperText={validationErrors.name}
            fullWidth
            autoFocus
            disabled={loading}
            variant="outlined"
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (validationErrors.password) setValidationErrors({ ...validationErrors, password: null });
            }}
            error={!!validationErrors.password}
            helperText={validationErrors.password}
            fullWidth
            disabled={loading}
            variant="outlined"
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{
              backgroundColor: '#1E3A5F',
              color: 'white',
              padding: '12px',
              fontSize: '16px',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '6px',
              '&:hover': { backgroundColor: '#142a47' },
              '&:disabled': { backgroundColor: '#CBD5E1' },
            }}
          >
            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Imposta password'}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
