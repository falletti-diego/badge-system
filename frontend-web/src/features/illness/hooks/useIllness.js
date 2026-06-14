import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useIllness = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getIllnessesByDateRange = useCallback(async (startDate, endDate) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/api/v1/illnesses/by-date-range', {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      });
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch illnesses';

      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getManagerIllnesses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/api/v1/illnesses/manager');
      return response.data.data || [];
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch illnesses');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reportIllness = useCallback(async (startDate, endDate, reason) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/v1/illnesses/report', {
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to report illness';

      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    getIllnessesByDateRange,
    getManagerIllnesses,
    reportIllness,
    loading,
    error,
  };
};
