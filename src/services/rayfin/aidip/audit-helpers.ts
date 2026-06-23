/**
 * Audit log + notification helpers for Rayfin AIDIP services.
 *
 * Centralizes the side-effect writes that many services need: recording
 * an audit log entry, pushing a notification to a user.
 */

import type {
  AuditAction,
  AuditSeverity,
  NotificationType,
  UserRole,
} from '@/lib/aidip/types';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentUserEmail, getCurrentUserId, nowIso, stringifyJson } from './helpers';
import { getCurrentCompanyId } from './helpers-session';

/**
 * Records an audit log entry. Pulls user/company context from the session.
 */
export async function recordAudit(
  action: AuditAction,
  resourceType: string | null,
  resourceId: string | null,
  details: Record<string, unknown>,
  severity: AuditSeverity = 'info',
): Promise<void> {
  try {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    const row = await client.data.User.findById(userId);
    const userName = (row as unknown as { fullName?: string } | null)?.fullName ?? 'Unknown';
    const userType = (row as unknown as { role?: UserRole } | null)?.role ?? 'analyst';
    await client.data.AuditLog.create({
      company_id: companyId,
      user_id: userId,
      userName,
      userType,
      action,
      resourceType,
      resourceId,
      details: stringifyJson(details),
      severity,
      ipAddress: null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      createdAt: nowIso(),
    } as never);
  } catch (err) {
    console.error('recordAudit failed:', err);
  }
}

/**
 * Pushes an in-app notification to a user. Email delivery is handled by
 * a separate Rayfin function (configured in rayfin.yml) — not triggered
 * here to avoid blocking the calling service.
 */
export async function pushNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  actionUrl: string | null,
  actionLabel: string | null,
): Promise<void> {
  try {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    await client.data.Notification.create({
      company_id: companyId,
      user_id: userId,
      type,
      title,
      message,
      actionUrl,
      actionLabel,
      status: 'unread',
      readAt: null,
      archivedAt: null,
      createdAt: nowIso(),
    } as never);
  } catch (err) {
    console.error('pushNotification failed:', err);
  }
}

export { getCurrentUserEmail };
