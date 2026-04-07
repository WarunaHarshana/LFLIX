'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '@/lib/mobileConfig';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  showId: number | null;
  tmdbId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  posterPath: string | null;
  read: number;
  actionUrl: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/notifications?limit=50'), { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silently fail on network errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark notifications as read
  const markAsRead = useCallback(async (ids?: number[]) => {
    try {
      await fetch(apiUrl('/api/notifications'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });

      if (ids) {
        setNotifications(prev =>
          prev.map(n => ids.includes(n.id) ? { ...n, read: 1 } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - ids.length));
      } else {
        setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
        setUnreadCount(0);
      }
    } catch { /* ignore */ }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/notifications'), {
        method: 'DELETE',
        credentials: 'include',
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  // Connect to SSE stream for real-time updates
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(apiUrl('/api/notifications/stream'));
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            console.log('[Notifications] SSE connected');
            return;
          }

          if (data.type === 'unread_count') {
            setUnreadCount(data.count);
            return;
          }

          // New notification received
          setNotifications(prev => [data, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);

          // Show browser notification if permitted
          showBrowserNotification(data);
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        // Reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connectSSE, 5000);
      };
    } catch {
      // SSE not supported or connection failed
    }
  }, []);

  // Show a browser notification (if permission granted)
  const showBrowserNotification = useCallback((notification: Notification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const icon = notification.posterPath
        ? `https://image.tmdb.org/t/p/w92${notification.posterPath}`
        : '/icon.ico';

      new Notification(notification.title, {
        body: notification.message,
        icon,
        tag: `lflix-${notification.id}`,
      });
    } catch { /* ignore */ }
  }, []);

  // Request browser notification permission
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  // Initial fetch + SSE connection
  useEffect(() => {
    fetchNotifications();
    connectSSE();

    // Also poll every 60 seconds as a fallback
    const pollInterval = setInterval(fetchNotifications, 60000);

    return () => {
      clearInterval(pollInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchNotifications, connectSSE]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    clearAll,
    fetchNotifications,
    requestPermission,
  };
}
