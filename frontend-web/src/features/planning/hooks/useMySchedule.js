import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
      console.warn('⚠️ useMySchedule: Missing month or year');
      return;
    }

    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await axios.get(
          `${API_BASE_URL}/api/shifts/my-schedule`,
          {
            params: { month, year },
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        setData(response.data.data);
        console.log(`📊 My schedule fetched from API for ${month}/${year}:`, response.data.data);

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
