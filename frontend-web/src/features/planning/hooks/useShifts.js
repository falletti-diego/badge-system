import { useState, useEffect } from 'react';
import apiClient from '../../../services/apiClient';

/**
 * useShifts — Fetch shift planning from backend API
 * GET /api/shifts/:siteId?month=X&year=Y
 * Returns: { shifts_data, employees[], site, metadata }
 */
export const useShifts = (siteId, month, year) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!siteId || !month || !year) {
      return;
    }

    const fetchShifts = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(`/api/shifts/${siteId}`, {
          params: { month, year },
        });

        setData(response.data.data);

      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch shifts';
        const statusCode = err.response?.status;

        console.error(`❌ Error fetching shifts (${statusCode}):`, errorMsg);
        setError({
          message: errorMsg,
          statusCode,
          isAuthError: statusCode === 401,
          isNotFoundError: statusCode === 404,
        });

      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [siteId, month, year]);

  return { data, loading, error };
};
