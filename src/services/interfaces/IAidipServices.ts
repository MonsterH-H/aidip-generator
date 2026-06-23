/**
 * AIDIP service interfaces.
 *
 * Each interface declares the contract a service must satisfy. Concrete
 * implementations live in `src/services/rayfin/aidip/` (production) and must
 * be consumed by components exclusively through these interfaces via the
 * `ServiceContainer`.
 */

import type {
  AuditAction,
  AuditLog,
  Company,
  Conversation,
  DashboardData,
  ExportConfigInput,
  Incident,
  Invitation,
  InvitationInput,
  KpiCard,
  Notification,
  NotificationPreferences,
  NotificationType,
  PaginatedResult,
  PaginationParams,
  PlatformAnalytics,
  Report,
  ReportInput,
  ReportSection,
  ReportSectionType,
  ReportShare,
  ReportShareInput,
  ReportSnapshot,
  SearchResult,
  SendChatMessageInput,
  SendChatMessageResult,
  TeamAnalytics,
  User,
  UserRole,
  UserStatus,
} from '@/lib/aidip/types';

/* ----------------------------------------------------------------------------
   Company service (super admin)
---------------------------------------------------------------------------- */

export interface ICompanyService {
  list(): Promise<Company[]>;
  get(id: string): Promise<Company | null>;
  create(input: {
    name: string;
    domain?: string;
    plan: Company['plan'];
    maxUsers: number;
    maxQueriesPerDay: number;
    storageGb: number;
    subscriptionStart?: string;
    subscriptionEnd?: string;
  }): Promise<Company>;
  update(id: string, patch: Partial<Company>): Promise<Company>;
  suspend(id: string): Promise<Company>;
  reactivate(id: string): Promise<Company>;
  softDelete(id: string): Promise<Company>;
  testFabricConnection(id: string): Promise<{ ok: boolean; message: string }>;
  extractSemanticSchema(id: string): Promise<{ ok: boolean; tablesFound: number }>;
}

/* ----------------------------------------------------------------------------
   User service (admin team management + current user)
---------------------------------------------------------------------------- */

export interface IUserService {
  /** Returns the currently signed-in user (with role + company). */
  getCurrent(): Promise<User | null>;
  /** Lists all users in the current company. Admin only. */
  listByCompany(filters?: {
    role?: UserRole;
    status?: UserStatus;
    search?: string;
  }): Promise<User[]>;
  /**
   * Lists all users of an explicit company. Used by the super admin
   * console to inspect any tenant's members — the session's companyId
   * (null for super admin) is bypassed in favor of the supplied id.
   */
  listByCompanyId(
    companyId: string,
    filters?: {
      role?: UserRole;
      status?: UserStatus;
      search?: string;
    },
  ): Promise<User[]>;
  get(id: string): Promise<User | null>;
  updateRole(id: string, role: UserRole): Promise<User>;
  suspend(id: string): Promise<User>;
  reactivate(id: string): Promise<User>;
  softDelete(id: string, transferReportsToUserId?: string): Promise<User>;
}

/* ----------------------------------------------------------------------------
   Invitation service
---------------------------------------------------------------------------- */

export interface IInvitationService {
  listByCompany(): Promise<Invitation[]>;
  create(input: InvitationInput): Promise<Invitation>;
  resend(id: string): Promise<Invitation>;
  cancel(id: string): Promise<Invitation>;
  validateToken(token: string): Promise<{ valid: boolean; invitation?: Invitation; reason?: string }>;
  accept(token: string): Promise<{ ok: boolean; message?: string }>;
}

/* ----------------------------------------------------------------------------
   Conversation service
---------------------------------------------------------------------------- */

export interface IConversationService {
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation | null>;
  create(title?: string): Promise<Conversation>;
  rename(id: string, title: string): Promise<Conversation>;
  archive(id: string): Promise<Conversation>;
  softDelete(id: string): Promise<void>;
}

/* ----------------------------------------------------------------------------
   Chat service — the core pipeline
---------------------------------------------------------------------------- */

export interface IChatService {
  /**
   * Sends a user message and returns the assistant's structured response.
   *
   * In production this is a 7-step pipeline (validation → intent → DAX
   * generation → DAB/XMLA execution → guardrail → formatting → save).
   * The response is returned as a single structured payload — the UI may
   * render the text portion progressively if it chooses, but no streaming
   * is handled at the service layer.
   */
  sendMessage(input: SendChatMessageInput): Promise<SendChatMessageResult>;

  /** Returns all messages of a conversation (user + assistant). */
  listMessages(conversationId: string): Promise<SendChatMessageResult['assistantMessage'][]>;

  /** Records 👍 / 👎 feedback on an assistant message. */
  setFeedback(messageId: string, feedback: 'positive' | 'negative', reason?: string): Promise<void>;

  /**
   * Generates AI insight bullets for a report section of type 'ai_insight'.
   * Invokes the server-side `generateAiInsight` Rayfin function, which
   * uses Azure OpenAI (modelReport) to analyze the previous section's
   * data and produce 2–5 actionable insight bullets.
   */
  generateInsight(input: {
    prompt: string;
    length: 'short' | 'medium' | 'long';
    previousSectionData?: {
      type: 'chart' | 'table' | 'kpi' | 'text';
      title?: string;
      series?: { label: string; value: number }[];
      rows?: Record<string, string | number>[];
      kpiValue?: number;
      kpiLabel?: string;
      text?: string;
    } | null;
  }): Promise<{ ok: boolean; bullets: string[]; errorMessage?: string }>;

  /**
   * Returns 4 dynamic chat suggestions for the welcome screen, based on
   * the company's semantic model schema and the user's recent conversation
   * history. Invokes the server-side `getChatSuggestions` Rayfin function.
   */
  getSuggestions(): Promise<string[]>;
}

/* ----------------------------------------------------------------------------
   Report service
---------------------------------------------------------------------------- */

export interface IReportService {
  list(filters?: {
    status?: Report['status'];
    visibility?: Report['visibility'];
    search?: string;
    tags?: string[];
  }): Promise<Report[]>;
  get(id: string): Promise<Report | null>;
  create(input: ReportInput): Promise<Report>;
  update(id: string, patch: Partial<ReportInput & { visibility: Report['visibility']; status: Report['status'] }>): Promise<Report>;
  softDelete(id: string): Promise<void>;
  duplicate(id: string): Promise<Report>;
  pinOfficial(id: string, pinned: boolean): Promise<Report>;
  archive(id: string): Promise<Report>;
  publish(id: string): Promise<Report>;
  /** Returns the full ordered list of sections for a report. */
  listSections(reportId: string): Promise<ReportSection[]>;
  addSection(reportId: string, input: { type: ReportSectionType; title: string }): Promise<ReportSection>;
  updateSection(reportId: string, sectionId: string, patch: Partial<ReportSection>): Promise<ReportSection>;
  removeSection(reportId: string, sectionId: string): Promise<void>;
  reorderSections(reportId: string, orderedIds: string[]): Promise<void>;
  refreshSectionData(reportId: string, sectionId: string): Promise<ReportSection>;
  /** Sharing */
  listShares(reportId: string): Promise<ReportShare[]>;
  share(reportId: string, input: ReportShareInput): Promise<ReportShare>;
  updateShare(reportId: string, shareId: string, patch: Partial<ReportShareInput>): Promise<ReportShare>;
  revokeShare(reportId: string, shareId: string): Promise<void>;
  /** Exports */
  listSnapshots(reportId: string): Promise<ReportSnapshot[]>;
  requestExport(reportId: string, config: ExportConfigInput): Promise<ReportSnapshot>;
}

/* ----------------------------------------------------------------------------
   Export service (cross-report list of snapshots)
---------------------------------------------------------------------------- */

export interface IExportService {
  /** Lists the current user's recent exports (across all reports). */
  listMine(): Promise<ReportSnapshot[]>;
  getSignedUrl(snapshotId: string): Promise<{ url: string; expiresAt: string } | null>;
}

/* ----------------------------------------------------------------------------
   Notification service
---------------------------------------------------------------------------- */

export interface INotificationService {
  list(filters?: { status?: Notification['status']; type?: NotificationType }): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  archive(id: string): Promise<void>;
  getPreferences(): Promise<NotificationPreferences>;
  updatePreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
}

/* ----------------------------------------------------------------------------
   Analytics service (admin team analytics + super-admin platform analytics)
---------------------------------------------------------------------------- */

export interface IAnalyticsService {
  getTeamAnalytics(): Promise<TeamAnalytics>;
  getPlatformAnalytics(): Promise<PlatformAnalytics>;
  getDashboardData(): Promise<DashboardData>;
}

/* ----------------------------------------------------------------------------
   Search service
---------------------------------------------------------------------------- */

export interface ISearchService {
  search(query: string, filters?: { type?: SearchResult['type'] }): Promise<SearchResult[]>;
}

/* ----------------------------------------------------------------------------
   Audit log service
---------------------------------------------------------------------------- */

export interface IAuditLogService {
  list(filters?: {
    action?: AuditAction;
    userId?: string;
    from?: string;
    to?: string;
  }): Promise<AuditLog[]>;
  exportCsv(): Promise<string>;
}

/* ----------------------------------------------------------------------------
   Impersonation service (super admin)
---------------------------------------------------------------------------- */

export interface IImpersonationService {
  start(targetUserId: string, reason: string): Promise<{ ok: boolean; message?: string }>;
  end(): Promise<void>;
  current(): Promise<{ active: boolean; session?: import('@/lib/aidip/types').ImpersonationSession }>;
}

/* ----------------------------------------------------------------------------
   Incident service (super admin)
---------------------------------------------------------------------------- */

export interface IIncidentService {
  list(): Promise<Incident[]>;
  create(input: {
    title: string;
    severity: Incident['severity'];
    description: string;
    impactedCompanyIds: string[];
  }): Promise<Incident>;
  updateStatus(id: string, status: Incident['status']): Promise<Incident>;
  resolve(id: string, postMortem: string): Promise<Incident>;
}

/* ----------------------------------------------------------------------------
   KPI config service (admin)
---------------------------------------------------------------------------- */

export interface IKpiConfigService {
  list(): Promise<KpiCard[]>;
  create(input: Omit<KpiCard, 'id'>): Promise<KpiCard>;
  update(id: string, patch: Partial<KpiCard>): Promise<KpiCard>;
  remove(id: string): Promise<void>;
}

/* ----------------------------------------------------------------------------
   Paginated variants
---------------------------------------------------------------------------- */

export interface IPaginatedService<T> {
  listPaginated(params: PaginationParams, filters?: Record<string, unknown>): Promise<PaginatedResult<T>>;
}
