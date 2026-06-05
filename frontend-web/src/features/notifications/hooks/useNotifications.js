import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../../services/apiClient';

const POLL_INTERVAL_MS = 30000;

export const useNotifications = (enabled = true) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await apiClient.get('/api/notifications');
      setNotifications(response.data.data || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch {
      // Non-critical: silently swallow polling errors
    }
  }, [enabled]);

  const markAllRead = useCallback(async () => {
    try {
      await apiClient.put('/api/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    fetchNotifications();

    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchNotifications]);

  return { notifications, unreadCount, markAllRead, refetch: fetchNotifications };
};
