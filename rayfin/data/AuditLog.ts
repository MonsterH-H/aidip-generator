import { entity, role, text, uuid, date, set, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'report_created'
  | 'report_exported'
  | 'role_modified'
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'member_deleted'
  | 'report_shared'
  | 'impersonate_started'
  | 'impersonate_ended'
  | 'company_suspended'
  | 'company_reactivated'
  | 'report_pinned_official'
  | 'settings_updated';

export type AuditSeverity = 'info' | 'warning' | 'critical';
export type UserRole = 'super_admin' | 'admin' | 'analyst';

/**
 * AuditLog — auditable action log.
 *
 * `company_id` is NULL for super_admin cross-tenant actions.
 * `details` is JSON.
 *
 * RLS:
 *   - super_admin: read all
 *   - admin: read own company's logs
 *   - analyst: no access
 *
 * Retention: 90 days (enforced by daily cleanup job).
 */
@entity()
@role('authenticated', '*')
export class AuditLog {
  @uuid() id!: string;
  @uuid({ optional: true }) company_id?: string;
  @one(() => Company, { optional: true }) company?: Company;

  @uuid({ optional: true }) user_id?: string;
  @one(() => User, { optional: true }) user!: User;

  @text() userName!: string;
  @set('super_admin', 'admin', 'analyst') userType!: UserRole;

  @set(
    'login',
    'logout',
    'report_created',
    'report_exported',
    'role_modified',
    'invitation_sent',
    'invitation_accepted',
    'member_deleted',
    'report_shared',
    'impersonate_started',
    'impersonate_ended',
    'company_suspended',
    'company_reactivated',
    'report_pinned_official',
    'settings_updated'
  ) action!: AuditAction;

  @text({ optional: true }) resourceType?: string;
  @text({ optional: true }) resourceId?: string;

  @text() details!: string; // JSON: Record<string, unknown>

  @set('info', 'warning', 'critical') severity!: AuditSeverity;
  @text({ optional: true }) ipAddress?: string;
  @text({ optional: true }) userAgent?: string;

  @date() createdAt!: Date;
}
