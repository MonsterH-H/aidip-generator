import { entity, role, text, uuid, date, set, int, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { Report } from './Report.js';
import { ChatMessage } from './ChatMessage.js';

export type ReportSectionType = 'text' | 'chart' | 'table' | 'kpi' | 'ai_insight';

/**
 * ReportSection — a single section within a report.
 *
 * `configuration` is JSON (type-specific config).
 * `dabQuery` is the live DAB query for chart/table/kpi sections.
 * `conversationMessageId` optionally links the section to the chat
 * message that generated it (for traceability).
 *
 * RLS: inherits from Report — same company_id scoping.
 */
@entity()
@role('authenticated', '*')
export class ReportSection {
  @uuid() id!: string;
  @uuid() report_id!: string;
  @one(() => Report) report!: Report;

  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @set('text', 'chart', 'table', 'kpi', 'ai_insight') type!: ReportSectionType;
  @text() title!: string;
  @int() orderIndex!: number;

  @text() configuration!: string; // JSON: ReportSectionConfig
  @text({ optional: true }) dabQuery?: string;

  @uuid({ optional: true }) conversationMessageId?: string;
  @one(() => ChatMessage, { optional: true }) conversationMessage?: ChatMessage;

  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
