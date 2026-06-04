import { useEffect, useState } from 'react';
import apiClient from '../../../services/apiClient';

const POLL_INTERVAL = 10000; // 10 seconds

export const useNotifications = (enabled = true) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const pollNotifications = async () => {
      try {
        const response = await apiClient.get('/api/notifications');
        setNotifications(response.data.data || []);
        setUnreadCount(response.data.unread_count || 0);
      } catch (err) {
        console.warn('Failed to fetch notifications:', err.message);
      }
    };

    // Initial poll
    pollNotifications();

    // Set up interval
    const interval = setInterval(pollNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [enabled]);

  return { notifications, unreadCount };
};
