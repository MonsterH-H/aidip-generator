/**
 * Rayfin-backed AIDIP Notification service.
 *
 * Notifications are user-scoped (RLS: claims.sub eq user_id). Real-time
 * delivery uses polling on the client (every 30 seconds) — there is no
 * SSE at the service layer. The UI hook useNotifications
 * polls list() periodically and reconciles state.
 */

import type {
  Notification,
  NotificationPreferences,
  NotificationType,
} from '@/lib/aidip/types';
import type { INotificationService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { nowIso, parseJson, stringifyJson } from './helpers';

interface RayfinNotificationRow {
  id: string;
  company_id?: string | null;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  status: 'unread' | 'read' | 'archived';
  readAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

interface RayfinNotificationPreferencesRow {
  id: string;
  user_id: string;
  company_id?: string | null;
  emailEnabled: boolean;
  emailFrequency: 'immediate' | 'daily' | 'weekly';
  inappEnabled: boolean;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  typesDisabled: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: RayfinNotificationRow): Notification {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.actionUrl ?? null,
    actionLabel: row.actionLabel ?? null,
    status: row.status,
    readAt: row.readAt ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
  };
}

function mapPrefsRow(row: RayfinNotificationPreferencesRow): NotificationPreferences {
  return {
    userId: row.user_id,
    emailEnabled: row.emailEnabled,
    emailFrequency: row.emailFrequency,
    inappEnabled: row.inappEnabled,
    dndEnabled: row.dndEnabled,
    dndStartHour: row.dndStartHour,
    dndEndHour: row.dndEndHour,
    typesDisabled: parseJson<NotificationType[]>(row.typesDisabled) ?? [],
  };
}

export class RayfinNotificationService implements INotificationService {
  async list(filters?: {
    status?: Notification['status'];
    type?: NotificationType;
  }): Promise<Notification[]> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const where: Record<string, unknown> = { user_id: { eq: userId } };
    if (filters?.status) where.status = { eq: filters.status };
    if (filters?.type) where.type = { eq: filters.type };
    const rows = await client.data.Notification.findMany(where as never);
    return rows
      .filter((r) => (r as unknown as RayfinNotificationRow).status !== 'archived')
      .map((r) => mapRow(r as unknown as RayfinNotificationRow))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markAsRead(id: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.Notification.update(
      { id },
      { status: 'read', readAt: nowIso() } as never,
    );
  }

  async markAllAsRead(): Promise<void> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const unread = await client.data.Notification.findMany({
      user_id: { eq: userId },
      status: { eq: 'unread' },
    } as never);
    const now = nowIso();
    for (const r of unread) {
      await client.data.Notification.update(
        { id: (r as unknown as { id: string }).id },
        { status: 'read', readAt: now } as never,
      );
    }
  }

  async archive(id: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.Notification.update(
      { id },
      { status: 'archived', archivedAt: nowIso() } as never,
    );
  }

  async getPreferences(): Promise<NotificationPreferences> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    const rows = await client.data.NotificationPreferences.findMany({
      user_id: { eq: userId },
    } as never);
    if (rows.length === 0) {
      // Lazy-create default preferences on first read.
      const now = nowIso();
      const row = await client.data.NotificationPreferences.create({
        user_id: userId,
        company_id: companyId,
        emailEnabled: true,
        emailFrequency: 'immediate',
        inappEnabled: true,
        dndEnabled: false,
        dndStartHour: 19,
        dndEndHour: 8,
        typesDisabled: stringifyJson([]),
        createdAt: now,
        updatedAt: now,
      } as never);
      return mapPrefsRow(row as unknown as RayfinNotificationPreferencesRow);
    }
    return mapPrefsRow(rows[0] as unknown as RayfinNotificationPreferencesRow);
  }

  async updatePreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const client = getRayfinClient();
    const current = await this.getPreferences();
    const rows = await client.data.NotificationPreferences.findMany({
      user_id: { eq: current.userId },
    } as never);
    if (rows.length === 0) return current;
    const id = (rows[0] as unknown as { id: string }).id;
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (patch.emailEnabled !== undefined) update.emailEnabled = patch.emailEnabled;
    if (patch.emailFrequency !== undefined) update.emailFrequency = patch.emailFrequency;
    if (patch.inappEnabled !== undefined) update.inappEnabled = patch.inappEnabled;
    if (patch.dndEnabled !== undefined) update.dndEnabled = patch.dndEnabled;
    if (patch.dndStartHour !== undefined) update.dndStartHour = patch.dndStartHour;
    if (patch.dndEndHour !== undefined) update.dndEndHour = patch.dndEndHour;
    if (patch.typesDisabled !== undefined) update.typesDisabled = stringifyJson(patch.typesDisabled);
    const row = await client.data.NotificationPreferences.update({ id }, update as never);
    return mapPrefsRow(row as unknown as RayfinNotificationPreferencesRow);
  }
}
