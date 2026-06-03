/**
 * Custom Hook: usePresences
 * Manages check-ins and stats data fetching with polling
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const usePresences = (filters = {}) => {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [stats, setStats] = useState({
    total_checkins: 0,
    unique_employees: 0,
    checkin_types: { IN: 0, OUT: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch presences (check-ins list)
   */
  const fetchPresences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get('/api/checkins', { params: filters });
      setData({
        rows: response.data.data || [],
        total: response.data.pagination?.total || 0,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch presences');
      console.error('Error fetching presences:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Fetch stats (KPI aggregations)
   */
  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/checkins/stats', { params: filters });
      setStats(response.data.data || {});
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [filters]);

  /**
   * Fetch both presences and stats
   */
  const refetch = useCallback(async () => {
    await Promise.all([fetchPresences(), fetchStats()]);
  }, [fetchPresences, fetchStats]);

  /**
   * Initial fetch on mount and when filters change
   */
  useEffect(() => {
    refetch();
  }, [refetch]);

  /**
   * Polling: Update stats every 30 seconds
   */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    data,
    stats,
    loading,
    error,
    refetch,
  };
};
