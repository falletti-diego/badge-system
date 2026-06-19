import { useState, useEffect } from 'react';
import apiClient from '../../../services/apiClient';

/**
 * useMySchedule — Fetch employee's own shift schedule from backend API
 * GET /api/shifts/my-schedule?month=X&year=Y
 * Returns: { shifts_data: {date: shift}, metadata }
 */
export const useMySchedule = (month, year) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!month || !year) {
      return;
    }

    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get('/api/v1/shifts/my-schedule', {
          params: { month, year },
        });

        setData(response.data.data);

      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch schedule';
        const statusCode = err.response?.status;

        console.error(`❌ Error fetching schedule (${statusCode}):`, errorMsg);
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

    fetchSchedule();
  }, [month, year]);

  return { data, loading, error };
};
