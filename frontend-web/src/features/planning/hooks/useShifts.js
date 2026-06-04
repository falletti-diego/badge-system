import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
      console.warn('⚠️ useShifts: Missing siteId, month, or year');
      return;
    }

    const fetchShifts = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await axios.get(
          `${API_BASE_URL}/api/shifts/${siteId}`,
          {
            params: { month, year },
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        setData(response.data.data);
        console.log(`📊 Shifts fetched from API for ${month}/${year}:`, response.data.data);

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
