/**
 * Custom Hook: useTrendData
 * Fetches the 30-day trend data for the Dashboard charts (presenze,
 * ore lavorate, ore straordinarie, assenteismo). Ignores date_from/date_to —
 * il backend calcola sempre gli ultimi 30 giorni fissi.
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useTrendData = (siteId, enabled = true) => {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrend = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const params = siteId ? { site_id: siteId } : {};
      const response = await apiClient.get('/api/v1/presences/trend', { params });
      setDays(response.data.data?.days || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch trend data');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, enabled]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  return { days, loading, error, refetch: fetchTrend };
};
