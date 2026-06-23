import { Company } from './Company.js';
import { User } from './User.js';
import { Invitation } from './Invitation.js';
import { Conversation } from './Conversation.js';
import { ChatMessage } from './ChatMessage.js';
import { Report } from './Report.js';
import { ReportSection } from './ReportSection.js';
import { ReportShare } from './ReportShare.js';
import { ReportSnapshot } from './ReportSnapshot.js';
import { Notification } from './Notification.js';
import { NotificationPreferences } from './NotificationPreferences.js';
import { AuditLog } from './AuditLog.js';
import { Incident } from './Incident.js';
import { KpiConfig } from './KpiConfig.js';

/**
 * AIDIP schema — type mapping entity names to their Rayfin-decorated classes.
 *
 * This type drives the typed `client.data.<Entity>` accessors on RayfinClient.
 */
export type AidipSchema = {
  Company: Company;
  User: User;
  Invitation: Invitation;
  Conversation: Conversation;
  ChatMessage: ChatMessage;
  Report: Report;
  ReportSection: ReportSection;
  ReportShare: ReportShare;
  ReportSnapshot: ReportSnapshot;
  Notification: Notification;
  NotificationPreferences: NotificationPreferences;
  AuditLog: AuditLog;
  Incident: Incident;
  KpiConfig: KpiConfig;
};

/**
 * Schema array — consumed by the Rayfin compiler at deploy time
 * (`rayfin up db apply`) to provision the corresponding SQL tables and
 * DAB entities with the correct RLS policies.
 */
export const schema = [
  Company,
  User,
  Invitation,
  Conversation,
  ChatMessage,
  Report,
  ReportSection,
  ReportShare,
  ReportSnapshot,
  Notification,
  NotificationPreferences,
  AuditLog,
  Incident,
  KpiConfig,
];
