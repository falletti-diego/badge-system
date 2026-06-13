import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useLeave = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createRequest = useCallback(
    async (leave_type, start_date, end_date, motivation) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.post('/api/v1/leave/request', {
          leave_type,
          start_date,
          end_date,
          motivation: motivation || undefined,
        });

        return response.data.data;
      } catch (err) {
        const errorMessage =
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to create leave request';

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
      const response = await apiClient.get('/api/v1/leave/my-requests');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to fetch leave requests';

      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetForm = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  const getPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/api/v1/leave/pending');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to fetch pending requests';

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
      const response = await apiClient.put(`/api/v1/leave/${requestId}/approve`, {
        status: 'APPROVED',
        rejection_reason: rejectionReason || null,
      });

      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to approve request';

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
      const response = await apiClient.put(`/api/v1/leave/${requestId}/approve`, {
        status: 'REJECTED',
        rejection_reason: rejectionReason || 'Rejected by manager',
      });

      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to reject request';

      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    createRequest,
    getMyRequests,
    getPendingRequests,
    approveRequest,
    rejectRequest,
    loading,
    error,
    clearError,
    resetForm,
  };
};
