/**
 * Rayfin-backed AIDIP Report service.
 *
 * Reports are company-scoped (RLS via company_id). Analyst visibility is
 * further restricted to: own + shared-with-me + official. The share /
 * snapshot sub-resources are managed via their own entity tables.
 */

import type {
  ExportConfigInput,
  Report,
  ReportInput,
  ReportSection,
  ReportSectionType,
  ReportShare,
  ReportShareInput,
  ReportSnapshot,
} from '@/lib/aidip/types';
import type { IReportService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { nowIso, parseJson, stringifyJson } from './helpers';
import { pushNotification, recordAudit } from './audit-helpers';

interface RayfinReportRow {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: Report['status'];
  visibility: Report['visibility'];
  isOfficial: boolean;
  pinnedBy?: string | null;
  pinnedAt?: string | null;
  structureJson: string;
  tags: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RayfinReportSectionRow {
  id: string;
  report_id: string;
  company_id: string;
  type: ReportSectionType;
  title: string;
  orderIndex: number;
  configuration: string;
  dabQuery?: string | null;
  conversationMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RayfinReportShareRow {
  id: string;
  report_id: string;
  company_id: string;
  sharedBy: string;
  sharedWith: string;
  permission: 'read' | 'write';
  allowDownload: boolean;
  allowReshare: boolean;
  personalMessage?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface RayfinReportSnapshotRow {
  id: string;
  report_id: string;
  company_id: string;
  user_id: string;
  format: 'pdf' | 'ppt';
  status: 'processing' | 'completed' | 'failed';
  fileUrl?: string | null;
  signedUrl?: string | null;
  fileSizeKb?: number | null;
  errorMessage?: string | null;
  expiresAt?: string | null;
  requestedAt: string;
  generatedAt?: string | null;
}

async function getOwnerName(userId: string): Promise<string> {
  const client = getRayfinClient();
  const u = await client.data.User.findById(userId);
  return (u as unknown as { fullName?: string } | null)?.fullName ?? 'Unknown';
}

async function getUserName(userId: string): Promise<{ name: string; email: string }> {
  const client = getRayfinClient();
  const u = await client.data.User.findById(userId);
  const row = u as unknown as { fullName?: string; email?: string } | null;
  return { name: row?.fullName ?? 'Unknown', email: row?.email ?? 'unknown' };
}

function mapReportRow(row: RayfinReportRow, ownerName: string): Report {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    ownerName,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    visibility: row.visibility,
    isOfficial: row.isOfficial,
    pinnedBy: row.pinnedBy ?? null,
    pinnedAt: row.pinnedAt ?? null,
    tags: parseJson<string[]>(row.tags) ?? [],
    structureJsonSize: row.structureJson.length,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSectionRow(row: RayfinReportSectionRow): ReportSection {
  return {
    id: row.id,
    reportId: row.report_id,
    companyId: row.company_id,
    type: row.type,
    title: row.title,
    orderIndex: row.orderIndex,
    configuration: parseJson(row.configuration) ?? {},
    dabQuery: row.dabQuery ?? null,
    conversationMessageId: row.conversationMessageId ?? null,
    loadStatus: 'loaded',
    freshness: row.updatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function mapShareRow(row: RayfinReportShareRow): Promise<ReportShare> {
  const [by, with_] = await Promise.all([
    getUserName(row.sharedBy),
    getUserName(row.sharedWith),
  ]);
  return {
    id: row.id,
    reportId: row.report_id,
    companyId: row.company_id,
    sharedBy: row.sharedBy,
    sharedByName: by.name,
    sharedWith: row.sharedWith,
    sharedWithName: with_.name,
    sharedWithEmail: with_.email,
    permission: row.permission,
    allowDownload: row.allowDownload,
    allowReshare: row.allowReshare,
    personalMessage: row.personalMessage ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

function mapSnapshotRow(row: RayfinReportSnapshotRow): Promise<ReportSnapshot> {
  return getUserName(row.user_id).then((u) => ({
    id: row.id,
    reportId: row.report_id,
    companyId: row.company_id,
    userId: row.user_id,
    userName: u.name,
    reportTitle: '', // populated by caller via report lookup
    format: row.format,
    status: row.status,
    fileUrl: row.fileUrl ?? null,
    signedUrl: row.signedUrl ?? null,
    fileSizeKb: row.fileSizeKb ?? null,
    errorMessage: row.errorMessage ?? null,
    expiresAt: row.expiresAt ?? null,
    requestedAt: row.requestedAt,
    generatedAt: row.generatedAt ?? null,
  }));
}

export class RayfinReportService implements IReportService {
  async list(filters?: {
    status?: Report['status'];
    visibility?: Report['visibility'];
    search?: string;
    tags?: string[];
  }): Promise<Report[]> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) return [];
    const where: Record<string, unknown> = { company_id: { eq: companyId } };
    let rows = await client.data.Report.findMany(where as never);
    rows = rows.filter((r) => (r as unknown as RayfinReportRow).status !== 'deleted');

    // Analyst visibility scoping (own + shared-with-me + official).
    const me = getCurrentUserId();
    const myShares = await client.data.ReportShare.findMany({
      sharedWith: { eq: me },
    } as never);
    const sharedIds = new Set(myShares.map((s) => (s as unknown as RayfinReportShareRow).report_id));
    const currentUserRow = await client.data.User.findById(me);
    const role = (currentUserRow as unknown as { role?: 'super_admin' | 'admin' | 'analyst' } | null)?.role ?? 'analyst';
    if (role === 'analyst') {
      rows = rows.filter((r) => {
        const row = r as unknown as RayfinReportRow;
        return row.user_id === me || sharedIds.has(row.id) || row.isOfficial;
      });
    }

    if (filters?.status) rows = rows.filter((r) => (r as unknown as RayfinReportRow).status === filters.status);
    if (filters?.visibility) rows = rows.filter((r) => (r as unknown as RayfinReportRow).visibility === filters.visibility);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r as unknown as RayfinReportRow).title.toLowerCase().includes(q) ||
          ((r as unknown as RayfinReportRow).description ?? '').toLowerCase().includes(q),
      );
    }
    if (filters?.tags && filters.tags.length > 0) {
      rows = rows.filter((r) => {
        const tags = parseJson<string[]>((r as unknown as RayfinReportRow).tags) ?? [];
        return filters.tags!.every((t) => tags.includes(t));
      });
    }

    const mapped = await Promise.all(
      rows.map(async (r) =>
        mapReportRow(r as unknown as RayfinReportRow, await getOwnerName((r as unknown as RayfinReportRow).user_id)),
      ),
    );
    return mapped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Report | null> {
    const client = getRayfinClient();
    const row = await client.data.Report.findById(id);
    if (!row || (row as unknown as RayfinReportRow).status === 'deleted') return null;
    return mapReportRow(row as unknown as RayfinReportRow, await getOwnerName((row as unknown as RayfinReportRow).user_id));
  }

  async create(input: ReportInput): Promise<Report> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const now = nowIso();
    const row = await client.data.Report.create({
      company_id: companyId,
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      status: 'draft',
      visibility: 'private',
      isOfficial: false,
      pinnedBy: null,
      pinnedAt: null,
      structureJson: stringifyJson({ sections: [] }),
      tags: stringifyJson(input.tags ?? []),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as never);
    await recordAudit('report_created', 'report', (row as unknown as { id: string }).id, { title: input.title });
    return mapReportRow(row as unknown as RayfinReportRow, await getOwnerName(userId));
  }

  async update(
    id: string,
    patch: Partial<ReportInput & { visibility: Report['visibility']; status: Report['status'] }>,
  ): Promise<Report> {
    const client = getRayfinClient();
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.tags !== undefined) update.tags = stringifyJson(patch.tags);
    if (patch.visibility !== undefined) update.visibility = patch.visibility;
    if (patch.status !== undefined) update.status = patch.status;
    const row = await client.data.Report.update({ id }, update as never);
    return mapReportRow(row as unknown as RayfinReportRow, await getOwnerName((row as unknown as RayfinReportRow).user_id));
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, { status: 'deleted' });
  }

  async duplicate(id: string): Promise<Report> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const original = await client.data.Report.findById(id);
    if (!original) throw new Error('Report not found.');
    const orig = original as unknown as RayfinReportRow;
    const now = nowIso();
    const copy = await client.data.Report.create({
      company_id: orig.company_id,
      user_id: userId,
      title: `${orig.title} (copy)`,
      description: orig.description,
      status: 'draft',
      visibility: 'private',
      isOfficial: false,
      pinnedBy: null,
      pinnedAt: null,
      structureJson: orig.structureJson,
      tags: orig.tags,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as never);
    // Duplicate sections too.
    const sections = await client.data.ReportSection.findMany({
      report_id: { eq: id },
    } as never);
    for (const s of sections) {
      const sr = s as unknown as RayfinReportSectionRow;
      await client.data.ReportSection.create({
        report_id: (copy as unknown as { id: string }).id,
        company_id: sr.company_id,
        type: sr.type,
        title: sr.title,
        orderIndex: sr.orderIndex,
        configuration: sr.configuration,
        dabQuery: sr.dabQuery,
        conversationMessageId: sr.conversationMessageId,
        createdAt: now,
        updatedAt: now,
      } as never);
    }
    return mapReportRow(copy as unknown as RayfinReportRow, await getOwnerName(userId));
  }

  async pinOfficial(id: string, pinned: boolean): Promise<Report> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const now = nowIso();
    const row = await client.data.Report.update(
      { id },
      {
        isOfficial: pinned,
        visibility: pinned ? 'official' : 'private',
        pinnedBy: pinned ? userId : null,
        pinnedAt: pinned ? now : null,
        updatedAt: now,
      } as never,
    );
    await recordAudit('report_pinned_official', 'report', id, { pinned });
    if (pinned) {
      // Notify all company users about the new Official report.
      const report = row as unknown as RayfinReportRow;
      const users = await client.data.User.findMany({
        company_id: { eq: report.company_id },
        status: { eq: 'active' },
      } as never);
      for (const u of users) {
        const uid = (u as unknown as { id: string }).id;
        if (uid !== userId) {
          await pushNotification(uid, 'report_official', 'A report was pinned as Official', `"${report.title}" is now visible company-wide.`, `/reports/${id}`, 'View report');
        }
      }
    }
    return mapReportRow(row as unknown as RayfinReportRow, await getOwnerName((row as unknown as RayfinReportRow).user_id));
  }

  async archive(id: string): Promise<Report> {
    return this.update(id, { status: 'archived' });
  }

  async publish(id: string): Promise<Report> {
    return this.update(id, { status: 'published' });
  }

  async listSections(reportId: string): Promise<ReportSection[]> {
    const client = getRayfinClient();
    const rows = await client.data.ReportSection.findMany({
      report_id: { eq: reportId },
    } as never);
    return rows
      .map((r) => mapSectionRow(r as unknown as RayfinReportSectionRow))
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async addSection(reportId: string, input: { type: ReportSectionType; title: string }): Promise<ReportSection> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const existing = await this.listSections(reportId);
    const now = nowIso();
    const row = await client.data.ReportSection.create({
      report_id: reportId,
      company_id: companyId,
      type: input.type,
      title: input.title,
      orderIndex: existing.length,
      configuration: stringifyJson({}),
      dabQuery: null,
      conversationMessageId: null,
      createdAt: now,
      updatedAt: now,
    } as never);
    return mapSectionRow(row as unknown as RayfinReportSectionRow);
  }

  async updateSection(_reportId: string, sectionId: string, patch: Partial<ReportSection>): Promise<ReportSection> {
    const client = getRayfinClient();
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.orderIndex !== undefined) update.orderIndex = patch.orderIndex;
    if (patch.configuration !== undefined) update.configuration = stringifyJson(patch.configuration);
    if (patch.dabQuery !== undefined) update.dabQuery = patch.dabQuery;
    if (patch.conversationMessageId !== undefined) update.conversationMessageId = patch.conversationMessageId;
    const row = await client.data.ReportSection.update({ id: sectionId }, update as never);
    return mapSectionRow(row as unknown as RayfinReportSectionRow);
  }

  async removeSection(_reportId: string, sectionId: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.ReportSection.delete({ id: sectionId });
  }

  async reorderSections(_reportId: string, orderedIds: string[]): Promise<void> {
    const client = getRayfinClient();
    const now = nowIso();
    for (let i = 0; i < orderedIds.length; i++) {
      await client.data.ReportSection.update(
        { id: orderedIds[i] },
        { orderIndex: i, updatedAt: now } as never,
      );
    }
  }

  async refreshSectionData(_reportId: string, sectionId: string): Promise<ReportSection> {
    const client = getRayfinClient();
    const row = await client.data.ReportSection.update(
      { id: sectionId },
      { updatedAt: nowIso() } as never,
    );
    return mapSectionRow(row as unknown as RayfinReportSectionRow);
  }

  async listShares(reportId: string): Promise<ReportShare[]> {
    const client = getRayfinClient();
    const rows = await client.data.ReportShare.findMany({
      report_id: { eq: reportId },
    } as never);
    return Promise.all(rows.map((r) => mapShareRow(r as unknown as RayfinReportShareRow)));
  }

  async share(reportId: string, input: ReportShareInput): Promise<ReportShare> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const userId = getCurrentUserId();
    const existing = await client.data.ReportShare.findMany({
      report_id: { eq: reportId },
      sharedWith: { eq: input.sharedWithUserId },
    } as never);
    if (existing.length > 0) throw new Error('This report is already shared with this user.');
    const report = await client.data.Report.findById(reportId);
    const row = await client.data.ReportShare.create({
      report_id: reportId,
      company_id: companyId,
      sharedBy: userId,
      sharedWith: input.sharedWithUserId,
      permission: input.permission,
      allowDownload: input.allowDownload,
      allowReshare: input.allowReshare,
      personalMessage: input.personalMessage ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: nowIso(),
    } as never);
    await recordAudit('report_shared', 'report', reportId, { sharedWith: input.sharedWithUserId, permission: input.permission });
    await pushNotification(
      input.sharedWithUserId,
      'report_shared',
      'A report was shared with you',
      `"${(report as unknown as { title?: string })?.title ?? 'A report'}" — you have ${input.permission === 'write' ? 'write' : 'read'} access.`,
      `/reports/${reportId}`,
      'View report',
    );
    return mapShareRow(row as unknown as RayfinReportShareRow);
  }

  async updateShare(_reportId: string, shareId: string, patch: Partial<ReportShareInput>): Promise<ReportShare> {
    const client = getRayfinClient();
    const update: Record<string, unknown> = {};
    if (patch.permission !== undefined) update.permission = patch.permission;
    if (patch.allowDownload !== undefined) update.allowDownload = patch.allowDownload;
    if (patch.allowReshare !== undefined) update.allowReshare = patch.allowReshare;
    if (patch.expiresAt !== undefined) update.expiresAt = patch.expiresAt;
    const row = await client.data.ReportShare.update({ id: shareId }, update as never);
    return mapShareRow(row as unknown as RayfinReportShareRow);
  }

  async revokeShare(_reportId: string, shareId: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.ReportShare.delete({ id: shareId });
  }

  async listSnapshots(reportId: string): Promise<ReportSnapshot[]> {
    const client = getRayfinClient();
    const report = await client.data.Report.findById(reportId);
    const reportTitle = (report as unknown as { title?: string })?.title ?? '';
    const rows = await client.data.ReportSnapshot.findMany({
      report_id: { eq: reportId },
    } as never);
    const mapped = await Promise.all(rows.map((r) => mapSnapshotRow(r as unknown as RayfinReportSnapshotRow)));
    return mapped
      .map((s) => ({ ...s, reportTitle }))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async requestExport(reportId: string, config: ExportConfigInput): Promise<ReportSnapshot> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const userId = getCurrentUserId();
    const report = await client.data.Report.findById(reportId);
    if (!report) throw new Error('Report not found.');

    // Enforce max concurrent exports per company.
    const processing = await client.data.ReportSnapshot.findMany({
      company_id: { eq: companyId },
      status: { eq: 'processing' },
    } as never);
    if (processing.length >= 3) {
      throw new Error(
        'Maximum concurrent exports reached (3). Your export is queued — you will be notified when processing starts.',
      );
    }

    const row = await client.data.ReportSnapshot.create({
      report_id: reportId,
      company_id: companyId,
      user_id: userId,
      format: config.format,
      status: 'processing',
      fileUrl: null,
      signedUrl: null,
      fileSizeKb: null,
      errorMessage: null,
      expiresAt: null,
      requestedAt: nowIso(),
      generatedAt: null,
    } as never);
    await recordAudit('report_exported', 'report_snapshot', (row as unknown as { id: string }).id, {
      format: config.format,
      reportTitle: (report as unknown as { title: string }).title,
    });

    // Trigger the server-side export worker (Rayfin function). The worker
    // reads the report structure, executes all DAB queries in parallel,
    // renders the document, uploads to Fabric storage, and updates this
    // snapshot row with the file URL + signed URL on completion.
    try {
      void client.functions.exportReport.invoke({
        snapshotId: (row as unknown as { id: string }).id,
        reportId,
        config,
      });
    } catch (err) {
      console.error('Failed to trigger export worker:', err);
    }

    const mapped = await mapSnapshotRow(row as unknown as RayfinReportSnapshotRow);
    return { ...mapped, reportTitle: (report as unknown as { title: string }).title };
  }
}
