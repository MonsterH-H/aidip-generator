import { entity, role, text, uuid, date, set, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type NotificationType =
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'report_shared'
  | 'export_ready'
  | 'export_failed'
  | 'quota_warning'
  | 'quota_exceeded'
  | 'maintenance'
  | 'report_official'
  | 'subscription_expiring'
  | 'schema_outdated'
  | 'incident_platform'
  | 'ai_budget_warning'
  | 'company_suspended'
  | 'user_suspended';

export type NotificationStatus = 'unread' | 'read' | 'archived';

/**
 * Notification — user-scoped notification.
 *
 * RLS: users see ONLY their own notifications.
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class Notification {
  @uuid() id!: string;
  @uuid({ optional: true }) company_id?: string;
  @one(() => Company, { optional: true }) company?: Company;

  @uuid() user_id!: string;
  @one(() => User) user!: User;

  @set(
    'invitation_sent',
    'invitation_accepted',
    'report_shared',
    'export_ready',
    'export_failed',
    'quota_warning',
    'quota_exceeded',
    'maintenance',
    'report_official',
    'subscription_expiring',
    'schema_outdated',
    'incident_platform',
    'ai_budget_warning',
    'company_suspended',
    'user_suspended'
  ) type!: NotificationType;

  @text() title!: string;
  @text() message!: string;
  @text({ optional: true }) actionUrl?: string;
  @text({ optional: true }) actionLabel?: string;

  @set('unread', 'read', 'archived') status!: NotificationStatus;
  @date({ optional: true }) readAt?: Date;
  @date({ optional: true }) archivedAt?: Date;

  @date() createdAt!: Date;
}
