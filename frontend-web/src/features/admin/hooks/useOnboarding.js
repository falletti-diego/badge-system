import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useOnboarding = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const preview = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/api/v1/admin/onboarding/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || err.response?.data?.error || err.message || 'Errore nella lettura del file';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const apply = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/api/v1/admin/onboarding/apply', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || err.response?.data?.error || err.message || "Errore nell'importazione";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resendCredentials = useCallback(async (employeeId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(`/api/v1/admin/employees/${employeeId}/reset-password`);
      return response.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || err.response?.data?.error || err.message || 'Errore nella rigenerazione credenziali';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { preview, apply, resendCredentials, loading, error, clearError };
};
