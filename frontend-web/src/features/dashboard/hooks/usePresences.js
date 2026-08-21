/**
 * Custom Hook: usePresences
 * Manages check-ins and stats data fetching with polling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../../services/apiClient';
import { mergeCheckinsWithEvents } from '../utils/presenceEvents';

export const usePresences = (filters = {}) => {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [stats, setStats] = useState({
    total_checkins: 0,
    unique_employees: 0,
    checkin_types: { IN: 0, OUT: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);

  /**
   * Fetch presences (check-ins list)
   */
  const fetchPresences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const checkinsPromise = apiClient.get('/api/v1/checkins', { params: filters });
      // Approved events aren't paginated server-side (a client only ever has a
      // handful per period) — merging them in on every page would duplicate
      // rows and desync the checkins pagination total, so they're only shown
      // alongside page 1.
      const isFirstPage = !filters.offset || filters.offset === 0;
      const eventsPromise = isFirstPage
        ? apiClient.get('/api/v1/events/approved', {
          params: {
            site_id: filters.site_id,
            employee_id: filters.employee_id,
            date_from: filters.date_from,
            date_to: filters.date_to,
          },
        })
        : Promise.resolve({ data: { data: [] } });

      const [checkinsRes, eventsRes] = await Promise.all([checkinsPromise, eventsPromise]);

      setData({
        rows: mergeCheckinsWithEvents(checkinsRes.data.data || [], eventsRes.data.data || []),
        total: checkinsRes.data.pagination?.total || 0,
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
      const response = await apiClient.get('/api/v1/checkins/stats', { params: filters });
      setStats(response.data.data || {});
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch stats');
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

  // Keep filters ref in sync for polling
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  /**
   * Polling: Update stats every 30 seconds using current filters ref
   */
  useEffect(() => {
    const pollStats = async () => {
      try {
        const response = await apiClient.get('/api/v1/checkins/stats', { params: filtersRef.current });
        setStats(response.data.data || {});
        setError(null);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to poll stats');
        console.error('Error polling stats:', err);
      }
    };

    const interval = setInterval(pollStats, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  return {
    data,
    stats,
    loading,
    error,
    refetch,
  };
};
