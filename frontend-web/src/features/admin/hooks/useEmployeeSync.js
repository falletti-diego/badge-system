import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useEmployeeSync = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadTemplate = useCallback(async (clientId) => {
    const params = clientId ? { client_id: clientId } : {};
    const response = await apiClient.get('/api/v1/admin/employee-sync/template', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aggiorna-dipendenti.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  }, []);

  const preview = useCallback(async (file, clientId) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (clientId) formData.append('client_id', clientId);
      const response = await apiClient.post('/api/v1/admin/employee-sync/preview', formData, {
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

  const apply = useCallback(async (file, clientId) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (clientId) formData.append('client_id', clientId);
      const response = await apiClient.post('/api/v1/admin/employee-sync/apply', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Errore nell'applicazione delle modifiche";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const exportHistory = useCallback(async (clientId) => {
    const params = clientId ? { client_id: clientId } : {};
    const response = await apiClient.get('/api/v1/admin/employee-sync/export-history', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'storico-dipendenti.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  }, []);

  return { downloadTemplate, preview, apply, exportHistory, loading, error };
};
