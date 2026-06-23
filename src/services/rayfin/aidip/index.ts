/**
 * Rayfin-backed AIDIP service factory.
 *
 * Wires all 14 AIDIP service interfaces to their Rayfin-backed
 * implementations. Used by ServiceContainer in production mode.
 */

import type {
  IAuditLogService,
  IChatService,
  ICompanyService,
  IConversationService,
  IExportService,
  IIncidentService,
  IInvitationService,
  IKpiConfigService,
  IImpersonationService,
  IAnalyticsService,
  INotificationService,
  IReportService,
  ISearchService,
  IUserService,
} from '@/services/interfaces/IAidipServices';

import { RayfinCompanyService } from './RayfinCompanyService';
import { RayfinUserService } from './RayfinUserService';
import { RayfinInvitationService } from './RayfinInvitationService';
import { RayfinConversationService } from './RayfinConversationService';
import { RayfinChatService } from './RayfinChatService';
import { RayfinReportService } from './RayfinReportService';
import { RayfinExportService } from './RayfinExportService';
import { RayfinNotificationService } from './RayfinNotificationService';
import { RayfinAnalyticsService } from './RayfinAnalyticsService';
import { RayfinSearchService } from './RayfinSearchService';
import { RayfinAuditLogService } from './RayfinAuditLogService';
import { RayfinImpersonationService } from './RayfinImpersonationService';
import { RayfinIncidentService } from './RayfinIncidentService';
import { RayfinKpiConfigService } from './RayfinKpiConfigService';

export interface AidipServices {
  company: ICompanyService;
  user: IUserService;
  invitation: IInvitationService;
  conversation: IConversationService;
  chat: IChatService;
  report: IReportService;
  export: IExportService;
  notification: INotificationService;
  analytics: IAnalyticsService;
  search: ISearchService;
  auditLog: IAuditLogService;
  impersonation: IImpersonationService;
  incident: IIncidentService;
  kpiConfig: IKpiConfigService;
}

/** Builds the full AIDIP services bundle, backed by Rayfin. */
export function createRayfinAidipServices(): AidipServices {
  return {
    company: new RayfinCompanyService(),
    user: new RayfinUserService(),
    invitation: new RayfinInvitationService(),
    conversation: new RayfinConversationService(),
    chat: new RayfinChatService(),
    report: new RayfinReportService(),
    export: new RayfinExportService(),
    notification: new RayfinNotificationService(),
    analytics: new RayfinAnalyticsService(),
    search: new RayfinSearchService(),
    auditLog: new RayfinAuditLogService(),
    impersonation: new RayfinImpersonationService(),
    incident: new RayfinIncidentService(),
    kpiConfig: new RayfinKpiConfigService(),
  };
}
