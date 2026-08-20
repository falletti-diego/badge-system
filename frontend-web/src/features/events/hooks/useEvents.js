import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useEvents = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createRequest = useCallback(
    async (event_date, start_time, end_time, description) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.post('/api/v1/events/request', {
          event_date,
          start_time,
          end_time,
          description,
        });
        return response.data.data;
      } catch (err) {
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Failed to create event request';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/events/my-requests');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch event requests';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/events/pending');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to fetch pending event requests';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const approveRequest = useCallback(async (requestId, rejectionReason) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/api/v1/events/${requestId}/approve`, {
        status: 'APPROVED',
        rejection_reason: rejectionReason || null,
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to approve event request';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectRequest = useCallback(async (requestId, rejectionReason) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/api/v1/events/${requestId}/approve`, {
        status: 'REJECTED',
        rejection_reason: rejectionReason || 'Rejected by manager',
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to reject event request';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    createRequest,
    getMyRequests,
    getPendingRequests,
    approveRequest,
    rejectRequest,
    loading,
    error,
    clearError,
  };
};
