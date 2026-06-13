import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import authService from '../services/authService';
import logger from '../utils/logger';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const validateForm = () => {
    const errors = {};
    if (!email) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email format';
    }
    if (!password) errors.password = 'Password is required';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    logger.debug('LoginPage', 'handleSubmit triggered', { email });
    setError(null);
    setValidationErrors({});

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      logger.warn('LoginPage', 'validation failed', errors);
      setValidationErrors(errors);
      return;
    }

    logger.debug('LoginPage', 'validation passed, calling authService.login');
    setLoading(true);

    try {
      await authService.login(email, password);
      logger.info('LoginPage', 'login successful', { email });
      navigate('/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Login failed. Please try again.';
      logger.error('LoginPage', 'login failed', err);
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
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'Cormorant Garamond',
              fontWeight: 600,
              color: '#1E3A5F',
              mb: 1,
            }}
          >
            Badge System
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Sign in to your account
          </Typography>
        </Box>

        {/* Form */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (validationErrors.email) {
                setValidationErrors({ ...validationErrors, email: null });
              }
            }}
            error={!!validationErrors.email}
            helperText={validationErrors.email}
            fullWidth
            autoFocus
            disabled={loading}
            variant="outlined"
            size="medium"
          />

          <TextField
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (validationErrors.password) {
                setValidationErrors({ ...validationErrors, password: null });
              }
            }}
            error={!!validationErrors.password}
            helperText={validationErrors.password}
            fullWidth
            disabled={loading}
            variant="outlined"
            size="medium"
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
            {loading ? (
              <CircularProgress size={24} sx={{ color: 'white' }} />
            ) : (
              'Sign In'
            )}
          </Button>
        </Box>

        {/* Demo Credentials Info — visible only in local dev builds, never in production */}
        {import.meta.env.DEV && (
          <Box
            sx={{
              mt: 4,
              p: 2,
              backgroundColor: '#F0F9FF',
              borderRadius: '6px',
              border: '1px solid #BFDBFE',
              width: '100%',
            }}
          >
            <Typography variant="caption" sx={{ color: '#1E40AF', fontWeight: 600 }}>
              Dev accounts (visible only in local dev — set passwords in .env):
            </Typography>
            <Typography variant="caption" sx={{ color: '#1E40AF', display: 'block', mt: 0.5, fontSize: '11px' }}>
              Admin: <code>pippo@badge.local</code>
            </Typography>
            <Typography variant="caption" sx={{ color: '#1E40AF', display: 'block', fontSize: '11px' }}>
              Manager: <code>pino@badge.local</code> (all stores) | <code>diego@badge.local</code> (⭐ Torino only)
            </Typography>
            <Typography variant="caption" sx={{ color: '#1E40AF', display: 'block', fontSize: '11px' }}>
              Employee: <code>maria@badge.local</code> | <code>lucia@badge.local</code>
            </Typography>
            <Typography variant="caption" sx={{ color: '#C2255C', display: 'block', fontSize: '11px', fontWeight: 600 }}>
              Employee (DB): <code>alice.neri@employee.it</code> | <code>luca.verdi@employee.it</code>
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
