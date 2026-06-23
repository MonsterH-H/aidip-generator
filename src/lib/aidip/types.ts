/**
 * AIDIP — AI Decision Intelligence Platform
 * Core domain types — single source of truth for the entire AIDIP front-end.
 *
 * Aligned with CDC-AIDIP-FINAL-v3.0 §15 (Data Model) and
 * AIDIP_ESPACES_UTILISATEURS.md v3.1.
 *
 * These types are framework-agnostic: they describe the domain model
 * that every service interface (Rayfin-backed) must produce and consume.
 */

/* ----------------------------------------------------------------------------
   Roles & Permissions
---------------------------------------------------------------------------- */

export type UserRole = 'super_admin' | 'admin' | 'analyst';

export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';

/** Routes each role is allowed to access. Used by route guards. */
export const ROLE_ALLOWED_ROUTE_PREFIXES: Record<UserRole, string[]> = {
  super_admin: ['/super-admin', '/dashboard', '/chat', '/reports', '/notifications', '/profile', '/help'],
  admin: ['/admin', '/dashboard', '/chat', '/reports', '/notifications', '/profile', '/help'],
  analyst: ['/dashboard', '/chat', '/reports', '/notifications', '/profile', '/help'],
};

/** Human-readable role label. */
export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin Entreprise',
  analyst: 'Analyste',
};

/* ----------------------------------------------------------------------------
   Company (Tenant)
---------------------------------------------------------------------------- */

export type CompanyPlan = 'free' | 'pro' | 'enterprise' | 'custom';
export type CompanyStatus = 'active' | 'suspended' | 'deleted';
export type AuthType = 'service_principal' | 'delegated';
export type AIProvider = 'azure_openai' | 'openai';

export interface Company {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan: CompanyPlan;
  status: CompanyStatus;
  maxUsers: number;
  maxQueriesPerDay: number;
  storageGb: number;
  queriesToday: number;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  // Fabric config (super-admin only)
  fabricWorkspaceId: string | null;
  fabricSemanticModelId: string | null;
  azureTenantId: string | null;
  servicePrincipalClientId: string | null;
  servicePrincipalClientSecretEnc: string | null; // never displayed after save
  xmlaEndpoint: string | null;
  authType: AuthType;
  // AI config (super-admin only)
  aiProvider: AIProvider;
  azureOpenaiEndpoint: string | null;
  azureOpenaiApiKeyEnc: string | null; // never displayed after save
  modelChatFast: string;
  modelChatComplex: string;
  modelReport: string;
  maxTokensPerRequest: number;
  aiDailyTokenBudget: number;
  // Display settings
  defaultTimezone: string;
  defaultCurrency: string;
  logoUrl: string | null;
  notesInternal: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ----------------------------------------------------------------------------
   User
---------------------------------------------------------------------------- */

export interface User {
  id: string;
  companyId: string | null; // null for super_admin
  email: string;
  fullName: string;
  azureAdId: string | null;
  role: UserRole;
  status: UserStatus;
  lastLogin: string | null;
  queriesToday: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Light-weight user reference for current-session use. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
  status: UserStatus;
}

/* ----------------------------------------------------------------------------
   Invitations
---------------------------------------------------------------------------- */

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invitation {
  id: string;
  companyId: string;
  invitedBy: string; // user id
  invitedByName: string;
  email: string;
  role: UserRole;
  token: string; // included for the admin UI to display the invitation link in the pending list (the actual email delivery uses the token_hash for lookups)
  personalMessage: string | null;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface InvitationInput {
  email: string;
  role: UserRole;
  personalMessage?: string;
  validityDays: number;
  /**
   * Optional override of the target tenant. Used by the super admin
   * console to invite a member into an explicitly selected company
   * (the session's companyId is null for super admins). When omitted,
   * the service falls back to the current session's company.
   */
  companyId?: string;
}

/* ----------------------------------------------------------------------------
   Conversations & Chat
---------------------------------------------------------------------------- */

export type ConversationStatus = 'active' | 'archived' | 'deleted';

export interface Conversation {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  messageCount: number;
  status: ConversationStatus;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatMessageRole = 'user' | 'assistant';
export type ChatFeedback = 'positive' | 'negative' | null;
export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'kpi';
export type ChatErrorKind =
  | 'ai_unavailable'
  | 'fabric_unavailable'
  | 'timeout'
  | 'quota_exceeded'
  | 'empty_data'
  | null;

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface ChatVisualization {
  type: ChartType;
  title: string;
  source: string; // e.g. "Sales semantic model"
  series: ChartSeriesPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface ChatTableColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'integer' | 'date' | 'text';
}

export interface ChatTableData {
  columns: ChatTableColumn[];
  rows: Record<string, string | number>[];
  totalRows: number;
}

export interface ChatInsight {
  kind: 'trend' | 'anomaly' | 'recommendation';
  text: string;
}

export interface ChatMessageContent {
  text: string;
  sourceCitation?: string;
  visualization?: ChatVisualization;
  table?: ChatTableData;
  insights?: ChatInsight[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: ChatMessageRole;
  contentText: string;
  contentJson: ChatMessageContent | null; // structured response for assistant messages
  daxQuery: string | null;
  tokensUsed: number | null;
  modelUsed: string | null;
  responseTimeMs: number | null;
  feedback: ChatFeedback;
  feedbackReason: string | null;
  errorKind: ChatErrorKind;
  createdAt: string;
}

/** Request payload for sending a chat message. */
export interface SendChatMessageInput {
  conversationId: string | null; // null = create new conversation
  text: string;
}

/** Response payload for a sent chat message. */
export interface SendChatMessageResult {
  conversation: Conversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

/* ----------------------------------------------------------------------------
   Reports
---------------------------------------------------------------------------- */

export type ReportStatus = 'draft' | 'published' | 'archived' | 'deleted';
export type ReportVisibility = 'private' | 'shared' | 'company' | 'official';
export type ReportSectionType = 'text' | 'chart' | 'table' | 'kpi' | 'ai_insight';

export interface Report {
  id: string;
  companyId: string;
  userId: string;
  ownerName: string;
  title: string;
  description: string | null;
  status: ReportStatus;
  visibility: ReportVisibility;
  isOfficial: boolean;
  pinnedBy: string | null;
  pinnedAt: string | null;
  tags: string[];
  structureJsonSize: number; // bytes — used to enforce 500KB limit
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSectionConfig {
  // Type-specific config — discriminated by section.type
  text?: { content: string; format?: 'plain' | 'markdown' };
  chart?: {
    chartType: ChartType;
    title?: string;
    source?: string;
    series?: ChartSeriesPoint[];
  };
  table?: {
    columns?: ChatTableColumn[];
    rows?: Record<string, string | number>[];
  };
  kpi?: {
    label: string;
    value: number;
    format?: 'currency' | 'percent' | 'integer';
    comparison?: { value: number; label: string };
    thresholds?: { warning?: number; critical?: number };
  };
  aiInsight?: {
    length?: 'short' | 'medium' | 'long';
    prompt?: string;
    /** Cached bullets produced by `aidip.chat.generateInsight`. */
    bullets?: string[];
  };
}

export interface ReportSection {
  id: string;
  reportId: string;
  companyId: string;
  type: ReportSectionType;
  title: string;
  orderIndex: number;
  configuration: ReportSectionConfig;
  dabQuery: string | null;
  conversationMessageId: string | null;
  // Status indicators (computed at runtime)
  loadStatus: 'loaded' | 'error' | 'loading';
  freshness: string; // e.g. "Updated 3 min ago"
  createdAt: string;
  updatedAt: string;
}

export interface ReportInput {
  title: string;
  description?: string;
  tags?: string[];
}

export interface ReportShare {
  id: string;
  reportId: string;
  companyId: string;
  sharedBy: string;
  sharedByName: string;
  sharedWith: string;
  sharedWithName: string;
  sharedWithEmail: string;
  permission: 'read' | 'write';
  allowDownload: boolean;
  allowReshare: boolean;
  personalMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReportShareInput {
  sharedWithUserId: string;
  permission: 'read' | 'write';
  allowDownload: boolean;
  allowReshare: boolean;
  personalMessage?: string;
  expiresAt?: string | null;
}

export type ExportFormat = 'pdf' | 'ppt';
export type ExportStatus = 'processing' | 'completed' | 'failed';

export interface ReportSnapshot {
  id: string;
  reportId: string;
  companyId: string;
  userId: string;
  userName: string;
  reportTitle: string;
  format: ExportFormat;
  status: ExportStatus;
  fileUrl: string | null;
  signedUrl: string | null;
  fileSizeKb: number | null;
  errorMessage: string | null;
  expiresAt: string | null;
  requestedAt: string;
  generatedAt: string | null;
}

export interface ExportConfigInput {
  format: ExportFormat;
  // PDF options
  includeCoverPage?: boolean;
  includeTableOfContents?: boolean;
  includeCompanyLogo?: boolean;
  quality?: 'standard' | 'high';
  sectionRange?: { from: number; to: number } | null;
  // PPT options
  pptTemplate?: 'standard' | 'minimal';
  includeDataTables?: boolean;
}

/* ----------------------------------------------------------------------------
   Notifications
---------------------------------------------------------------------------- */

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
export type EmailFrequency = 'immediate' | 'daily' | 'weekly';

export interface Notification {
  id: string;
  companyId: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  status: NotificationStatus;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  emailFrequency: EmailFrequency;
  inappEnabled: boolean;
  dndEnabled: boolean;
  dndStartHour: number; // 0-23
  dndEndHour: number; // 0-23
  typesDisabled: NotificationType[];
}

/* ----------------------------------------------------------------------------
   Audit Logs
---------------------------------------------------------------------------- */

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

export interface AuditLog {
  id: string;
  companyId: string | null;
  userId: string | null;
  userName: string;
  userType: UserRole;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/* ----------------------------------------------------------------------------
   Analytics & Dashboard
---------------------------------------------------------------------------- */

export interface KpiCard {
  id: string;
  title: string;
  icon: 'revenue' | 'inventory' | 'customers' | 'growth' | 'queries' | 'users' | 'reports' | 'uptime';
  valueType: 'amount' | 'percentage' | 'integer';
  value: number;
  format: string; // e.g. "MAD", "%", "integer"
  comparison: {
    value: number; // percentage change vs previous period
    label: string;
  } | null;
  sparkline: number[];
  dabQuery?: string;
  source?: string;
}

export interface DashboardData {
  kpis: KpiCard[];
  recentActivity: RecentActivityItem[];
  officialReports: Report[];
  suggestions: string[]; // chatbot suggestions
  quota: {
    used: number;
    total: number;
    resetsAt: string;
  };
}

export interface RecentActivityItem {
  id: string;
  type: 'conversation' | 'report_modified' | 'export_ready' | 'report_shared';
  title: string;
  subtitle: string;
  timestamp: string;
  actionUrl: string;
}

export interface TeamAnalytics {
  activeUsersToday: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  totalQueriesThisMonth: number;
  queryQuota: number;
  reportsCreatedThisMonth: number;
  exportsGeneratedThisMonth: number;
  avgResponseTimeSec: number;
  queryEvolution30d: { date: string; queries: number }[];
  queryDistributionPerUser: { userName: string; queries: number }[];
  peakHours: { day: number; hour: number; queries: number }[]; // heatmap
  topReportCreators: { userName: string; count: number }[];
}

export interface PlatformAnalytics {
  activeCompanies: number;
  totalUsers: number;
  aiQueriesToday: number;
  aiQueriesThisMonth: number;
  uptimePercent: number;
  aggregatedTokenCostUsd: number;
  companyEvolution6m: { month: string; count: number }[];
  queryDistributionTop10: { companyName: string; queries: number }[];
  uptime30d: { date: string; uptime: number }[];
  activeAlerts: PlatformAlert[];
}

export interface PlatformAlert {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  impactedCompanyIds: string[];
  createdAt: string;
}

/* ----------------------------------------------------------------------------
   Global Search
---------------------------------------------------------------------------- */

export type SearchResultType = 'conversation' | 'report' | 'export';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  excerpt: string;
  status: string;
  timestamp: string;
  actionUrl: string;
}

/* ----------------------------------------------------------------------------
   Incidents (Super Admin)
---------------------------------------------------------------------------- */

export type IncidentSeverity = 'critical' | 'major' | 'minor';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  impactedCompanyIds: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  postMortem: string | null;
}

/* ----------------------------------------------------------------------------
   Impersonation
---------------------------------------------------------------------------- */

export interface ImpersonationSession {
  superAdminId: string;
  superAdminName: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  targetCompanyName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

/* ----------------------------------------------------------------------------
   Pagination
---------------------------------------------------------------------------- */

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/* ----------------------------------------------------------------------------
   Generic service result
---------------------------------------------------------------------------- */

export interface ServiceError {
  code: string;
  message: string;
  field?: string;
}

export interface AsyncOperationResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}
