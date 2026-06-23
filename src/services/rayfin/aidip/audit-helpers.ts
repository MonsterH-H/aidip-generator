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
 * Records an audit log entry. Pulls user/company context from the session,
 * unless `companyIdOverride` is supplied (used by super-admin cross-tenant
 * operations so the audit row is attributed to the acted-on company).
 */
export async function recordAudit(
  action: AuditAction,
  resourceType: string | null,
  resourceId: string | null,
  details: Record<string, unknown>,
  severity: AuditSeverity = 'info',
  companyIdOverride?: string,
): Promise<void> {
  try {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = companyIdOverride ?? (await getCurrentCompanyId());
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
 * Pushes an in-app notification to a user. Also triggers the server-side
 * `sendNotificationEmail` Rayfin function (Resend) as a fire-and-forget
 * side effect — the function checks the user's email preferences before
 * sending, so no client-side filtering is needed.
 *
 * `companyIdOverride` lets the super admin console attach the notification
 * to the company being acted on (the session's companyId is null for
 * super admins).
 */
export async function pushNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  actionUrl: string | null,
  actionLabel: string | null,
  companyIdOverride?: string,
): Promise<void> {
  try {
    const client = getRayfinClient();
    const companyId = companyIdOverride ?? (await getCurrentCompanyId());
    const row = await client.data.Notification.create({
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
    const notificationId = (row as unknown as { id: string }).id;

    // Fire-and-forget: trigger the notification email via the server-side
    // `sendNotificationEmail` Rayfin function. The function checks the
    // user's email preferences (emailEnabled, typesDisabled, DND) before
    // sending. Non-blocking — the in-app notification is already persisted.
    try {
      void client.functions.sendNotificationEmail.invoke({ notificationId });
    } catch (err) {
      console.error('Failed to trigger notification email:', err);
    }
  } catch (err) {
    console.error('pushNotification failed:', err);
  }
}

export { getCurrentUserEmail };
