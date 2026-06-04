import { useEffect, useState } from 'react';
import apiClient from '../../../services/apiClient';

export const useShifts = (siteId, month, year) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!siteId) {
      setData(null);
      return;
    }

    const fetchShifts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/api/shifts/${siteId}`, {
          params: { month, year }
        });
        setData(response.data.data); // {shifts_data, employees, site, metadata}
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch shifts');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [siteId, month, year]);

  return { data, loading, error };
};
