/**
 * Notification bell + side panel hook.
 *
 * Polls the notification service every 30 seconds for fresh items and
 * exposes the unread count + mutation helpers. There is no client-side
 * SSE channel — the Rayfin backend delivers notifications through
 * its own real-time channel (configured in rayfin.yml) and we reconcile
 * state via polling on this side.
 */

import { useEffect, useState } from 'react';

import type { Notification } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from './useAidipSession';

/** Polling interval — 30 seconds (CDC §11.1 heartbeat). */
const POLL_INTERVAL_MS = 30_000;

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAidipSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const svc = ServiceContainer.getInstance().aidip.notification;
      const list = await svc.list();
      setNotifications(list);
    } catch (err) {
      console.error('Failed to refresh notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user]);

  const unreadCount = Math.min(
    99,
    notifications.filter((n) => n.status === 'unread').length,
  );

  return {
    notifications,
    unreadCount: unreadCount > 9 ? 9 : unreadCount, // capped at "9+" display
    loading,
    markAsRead: async (id) => {
      await ServiceContainer.getInstance().aidip.notification.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'read', readAt: new Date().toISOString() } : n)),
      );
    },
    markAllAsRead: async () => {
      await ServiceContainer.getInstance().aidip.notification.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => (n.status === 'unread' ? { ...n, status: 'read', readAt: new Date().toISOString() } : n)),
      );
    },
    archive: async (id) => {
      await ServiceContainer.getInstance().aidip.notification.archive(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    },
    refresh,
  };
}
