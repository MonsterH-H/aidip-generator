/**
 * AIDIP — Application constants & configuration values.
 */

import type {
  NotificationType,
  UserRole,
  UserStatus,
  InvitationStatus,
  ConversationStatus,
  ReportStatus,
  ReportVisibility,
  ReportSectionType,
  ExportFormat,
  ExportStatus,
  AuditAction,
  IncidentSeverity,
  IncidentStatus,
} from './types';

/* ----------------------------------------------------------------------------
   Application meta
---------------------------------------------------------------------------- */

export const AIDIP_BRAND = {
  name: 'AIDIP',
  tagline: 'AI Decision Intelligence Platform',
  vendor: 'HESYD',
  version: 'v3.0 MVP',
  supportEmail: 'support@hesyd.com',
} as const;

/** Maximum chat message length. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Show character counter after this many chars typed. */
export const CHAT_MESSAGE_COUNTER_THRESHOLD = 1500;

/** Number of recent messages included in each AI context window. */
export const CHAT_CONTEXT_WINDOW_SIZE = 10;

/** Streaming rate target (tokens per second) — used by the server-side chat function for pacing. */
export const CHAT_STREAM_TOKENS_PER_SEC = 40;

/** Daily quota reset hour (UTC). */
export const QUOTA_RESET_HOUR_UTC = 0;

/** Max KPI cards per dashboard (MVP limit). */
export const MAX_DASHBOARD_KPIS = 4;

/** Max sections per report (MVP limit). */
export const MAX_REPORT_SECTIONS = 20;

/** Max structure_json size in bytes (MVP limit). */
export const MAX_STRUCTURE_JSON_BYTES = 500 * 1024; // 500 KB

/** Max concurrent exports per company. */
export const MAX_CONCURRENT_EXPORTS = 3;

/** Export signed URL validity (hours). */
export const EXPORT_SIGNED_URL_HOURS = 24;

/** Export worker timeout (minutes). */
export const EXPORT_TIMEOUT_MINUTES = 10;

/** Impersonation max duration (minutes). */
export const IMPERSONATE_MAX_DURATION_MINUTES = 30;

/** Soft-delete grace period (days). */
export const SOFT_DELETE_GRACE_DAYS = 30;

/** Audit log retention (days). */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/** Notification archive after (days). */
export const NOTIFICATION_ARCHIVE_DAYS = 30;

/** Notification physical delete after (days). */
export const NOTIFICATION_DELETE_DAYS = 90;

/** Default pagination size. */
export const DEFAULT_PAGE_SIZE = 20;

/* ----------------------------------------------------------------------------
   Role config
---------------------------------------------------------------------------- */

export const ROLE_VALUES: UserRole[] = ['super_admin', 'admin', 'analyst'];

export const ROLE_BADGE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  super_admin: 'destructive',
  admin: 'default',
  analyst: 'secondary',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  super_admin: 'Platform owner (HESYD). Manages all tenants, deployments, and AI infrastructure.',
  admin: "Company administrator. Manages members, invitations, KPIs and dataset permissions.",
  analyst: 'End user. Asks questions, builds reports, exports and shares within the company.',
};

/* ----------------------------------------------------------------------------
   Status configs
---------------------------------------------------------------------------- */

export const USER_STATUS_VALUES: UserStatus[] = ['active', 'suspended', 'pending', 'deleted'];

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  pending: 'Pending invitation',
  deleted: 'Deleted',
};

export const USER_STATUS_BADGE_VARIANT: Record<
  UserStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  suspended: 'destructive',
  pending: 'secondary',
  deleted: 'outline',
};

export const INVITATION_STATUS_VALUES: InvitationStatus[] = [
  'pending',
  'accepted',
  'expired',
  'cancelled',
];

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const INVITATION_STATUS_BADGE_VARIANT: Record<
  InvitationStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  accepted: 'default',
  expired: 'outline',
  cancelled: 'destructive',
};

export const COMPANY_PLAN_VALUES: Array<'free' | 'pro' | 'enterprise' | 'custom'> = ['free', 'pro', 'enterprise', 'custom'];

export const COMPANY_PLAN_LABEL: Record<'free' | 'pro' | 'enterprise' | 'custom', string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

export const COMPANY_PLAN_BADGE_VARIANT: Record<
  'free' | 'pro' | 'enterprise' | 'custom',
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  free: 'outline',
  pro: 'secondary',
  enterprise: 'default',
  custom: 'default',
};

export const COMPANY_STATUS_VALUES: Array<'active' | 'suspended' | 'deleted'> = ['active', 'suspended', 'deleted'];

export const COMPANY_STATUS_LABEL: Record<'active' | 'suspended' | 'deleted', string> = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
};

export const COMPANY_STATUS_BADGE_VARIANT: Record<
  'active' | 'suspended' | 'deleted',
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  suspended: 'destructive',
  deleted: 'outline',
};

export const CONVERSATION_STATUS_VALUES: ConversationStatus[] = ['active', 'archived', 'deleted'];

export const REPORT_STATUS_VALUES: ReportStatus[] = ['draft', 'published', 'archived', 'deleted'];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
  deleted: 'Deleted',
};

export const REPORT_STATUS_BADGE_VARIANT: Record<
  ReportStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  published: 'default',
  archived: 'outline',
  deleted: 'destructive',
};

export const REPORT_VISIBILITY_VALUES: ReportVisibility[] = [
  'private',
  'shared',
  'company',
  'official',
];

export const REPORT_VISIBILITY_LABEL: Record<ReportVisibility, string> = {
  private: 'Private',
  shared: 'Shared',
  company: 'Company',
  official: 'Official',
};

export const REPORT_SECTION_TYPE_VALUES: ReportSectionType[] = [
  'text',
  'chart',
  'table',
  'kpi',
  'ai_insight',
];

export const REPORT_SECTION_TYPE_LABEL: Record<ReportSectionType, string> = {
  text: 'Text',
  chart: 'Chart',
  table: 'Table',
  kpi: 'KPI',
  ai_insight: 'AI Insight',
};

export const EXPORT_FORMAT_VALUES: ExportFormat[] = ['pdf', 'ppt'];

export const EXPORT_STATUS_VALUES: ExportStatus[] = ['processing', 'completed', 'failed'];

export const EXPORT_STATUS_LABEL: Record<ExportStatus, string> = {
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

export const EXPORT_STATUS_BADGE_VARIANT: Record<
  ExportStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
};

/* ----------------------------------------------------------------------------
   Notification configs
---------------------------------------------------------------------------- */

export const NOTIFICATION_TYPE_VALUES: NotificationType[] = [
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
  'user_suspended',
];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  invitation_sent: 'Invitation sent',
  invitation_accepted: 'Invitation accepted',
  report_shared: 'Report shared',
  export_ready: 'Export ready',
  export_failed: 'Export failed',
  quota_warning: 'Quota warning',
  quota_exceeded: 'Quota exceeded',
  maintenance: 'Maintenance',
  report_official: 'Report pinned Official',
  subscription_expiring: 'Subscription expiring',
  schema_outdated: 'Schema outdated',
  incident_platform: 'Platform incident',
  ai_budget_warning: 'AI budget warning',
  company_suspended: 'Company suspended',
  user_suspended: 'User suspended',
};

/** Which notification types each role can receive. */
export const NOTIFICATION_TYPE_BY_ROLE: Record<UserRole, NotificationType[]> = {
  super_admin: [
    'export_ready',
    'export_failed',
    'maintenance',
    'subscription_expiring',
    'incident_platform',
    'ai_budget_warning',
    'company_suspended',
  ],
  admin: [
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
    'user_suspended',
  ],
  analyst: [
    'report_shared',
    'export_ready',
    'export_failed',
    'quota_warning',
    'quota_exceeded',
    'maintenance',
    'report_official',
  ],
};

/* ----------------------------------------------------------------------------
   Audit log configs
---------------------------------------------------------------------------- */

export const AUDIT_ACTION_VALUES: AuditAction[] = [
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
  'settings_updated',
];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  login: 'Sign in',
  logout: 'Sign out',
  report_created: 'Report created',
  report_exported: 'Report exported',
  role_modified: 'Member role modified',
  invitation_sent: 'Invitation sent',
  invitation_accepted: 'Invitation accepted',
  member_deleted: 'Member deleted',
  report_shared: 'Report shared',
  impersonate_started: 'Impersonation started',
  impersonate_ended: 'Impersonation ended',
  company_suspended: 'Company suspended',
  company_reactivated: 'Company reactivated',
  report_pinned_official: 'Report pinned Official',
  settings_updated: 'Settings updated',
};

/* ----------------------------------------------------------------------------
   Incident configs
---------------------------------------------------------------------------- */

export const INCIDENT_SEVERITY_VALUES: IncidentSeverity[] = ['critical', 'major', 'minor'];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
};

export const INCIDENT_SEVERITY_SLA_HOURS: Record<IncidentSeverity, number> = {
  critical: 4,
  major: 24,
  minor: 168, // 7 days
};

export const INCIDENT_STATUS_VALUES: IncidentStatus[] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
];

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

/* ----------------------------------------------------------------------------
   Time / locale
---------------------------------------------------------------------------- */

export const SUPPORTED_TIMEZONES = [
  'Africa/Casablanca',
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'UTC',
] as const;

export const SUPPORTED_CURRENCIES = ['MAD', 'EUR', 'USD', 'GBP', 'AED'] as const;

/** UI language is locked to English for MVP per CDC §21.1. */
export const UI_LANGUAGE = 'en' as const;
