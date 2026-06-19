import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, TextField, Alert, CircularProgress, Container, Paper, Typography } from '@mui/material';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

/**
 * ChangePasswordPage
 *
 * Forced password change flow for users with must_change_password=true.
 *
 * Flow:
 * 1. User logs in with temp password → must_change_password=true
 * 2. Redirect to /change-password (via App.jsx guard)
 * 3. User enters old password (the temp one) + new password
 * 4. POST /api/auth/change-password
 * 5. Response includes new token with must_change_password=false
 * 6. Auto-update localStorage + auto-redirect to /dashboard
 *
 * Error Handling (Opzione B — Intelligente):
 * - Validation errors (400): Show message, allow retry
 * - Server errors (5xx): Show warning, allow retry
 * - Network timeout: Show error, allow retry
 * - Session revoked (401): Logout + redirect to /login
 */

export default function ChangePasswordPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  /**
   * Client-side validation
   * @returns {object} errors object (empty if valid)
   */
  const validateForm = () => {
    const newErrors = {};

    if (!formData.oldPassword) {
      newErrors.oldPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm password is required';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (formData.oldPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle password change submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    setApiSuccess(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Call backend to change password
      const response = await apiClient.post('/api/v1/auth/change-password', {
        old_password: formData.oldPassword,
        new_password: formData.newPassword,
      });

      // Backend returns: { data: { token, refresh_token, user } }
      const { token, refresh_token, user } = response.data.data;

      if (!token || !refresh_token) {
        throw new Error('Invalid response from server');
      }

      // Show success message
      setApiSuccess('Password changed successfully! Please log in with your new password.');

      // Logout to clear old session and localStorage (including must_change_password flag)
      authService.logout();

      // Auto-redirect to login after 2 seconds (let user see success message)
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      setLoading(false);

      // Handle different error types (Opzione B — Intelligente)
      if (err.response) {
        const { status, data } = err.response;

        if (status === 401) {
          // Session revoked or token expired
          // Force logout + redirect to login
          authService.logout();
          navigate('/login', { replace: true });
          setApiError('Your session has expired. Please log in again.');
        } else if (status === 400) {
          // Validation error from backend (old password wrong, etc)
          // User can retry
          setApiError(data.message || 'Invalid request. Please check your password and try again.');
          setErrors({ form: true });
        } else if (status >= 500) {
          // Server error (temporary)
          // User can retry
          setApiError(
            'Server error. Please wait a moment and try again. Your session is still valid.'
          );
        } else {
          // Other error
          setApiError(data.message || 'Failed to change password. Please try again.');
        }
      } else if (err.request) {
        // Network error (no response from server)
        setApiError(
          'Network error. Please check your connection and try again. Your session is still valid.'
        );
      } else {
        // Unknown error
        setApiError('An unexpected error occurred. Please try again.');
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    // Clear field-specific error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          py: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 2,
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{
              mb: 1,
              fontWeight: 'bold',
              textAlign: 'center',
              color: '#1a237e',
            }}
          >
            Change Password
          </Typography>

          <Typography
            variant="body2"
            sx={{
              mb: 3,
              textAlign: 'center',
              color: '#666',
            }}
          >
            For security reasons, you must change your password before you can continue.
          </Typography>

          {/* Success Message */}
          {apiSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {apiSuccess}
            </Alert>
          )}

          {/* Error Messages */}
          {apiError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {apiError}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {/* Old Password */}
            <TextField
              fullWidth
              label="Current Password"
              name="oldPassword"
              type="password"
              value={formData.oldPassword}
              onChange={handleInputChange}
              error={!!errors.oldPassword}
              helperText={errors.oldPassword}
              disabled={loading}
              margin="normal"
              autoComplete="current-password"
            />

            {/* New Password */}
            <TextField
              fullWidth
              label="New Password"
              name="newPassword"
              type="password"
              value={formData.newPassword}
              onChange={handleInputChange}
              error={!!errors.newPassword}
              helperText={errors.newPassword}
              disabled={loading}
              margin="normal"
              autoComplete="new-password"
            />

            {/* Confirm Password */}
            <TextField
              fullWidth
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword}
              disabled={loading}
              margin="normal"
              autoComplete="new-password"
            />

            {/* Submit Button */}
            <Button
              fullWidth
              variant="contained"
              color="primary"
              type="submit"
              disabled={loading}
              sx={{
                mt: 3,
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 'bold',
                textTransform: 'none',
              }}
            >
              {loading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Changing password...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>

          {/* Info Box */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              backgroundColor: '#f5f5f5',
              borderRadius: 1,
              border: '1px solid #ddd',
            }}
          >
            <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
              <strong>Requirements:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                <li>At least 8 characters</li>
                <li>Different from current password</li>
              </ul>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
