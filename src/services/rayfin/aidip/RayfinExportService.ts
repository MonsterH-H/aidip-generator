/**
 * Rayfin-backed AIDIP Export service.
 *
 * Cross-report list of the current user's recent exports. Signed URLs
 * are generated server-side by a Rayfin function (24h validity).
 */

import type { ReportSnapshot } from '@/lib/aidip/types';
import type { IExportService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentUserId } from './helpers-session';

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

async function getUserName(userId: string): Promise<string> {
  const client = getRayfinClient();
  const u = await client.data.User.findById(userId);
  return (u as unknown as { fullName?: string } | null)?.fullName ?? 'Unknown';
}

async function getReportTitle(reportId: string): Promise<string> {
  const client = getRayfinClient();
  const r = await client.data.Report.findById(reportId);
  return (r as unknown as { title?: string } | null)?.title ?? '';
}

function mapRow(row: RayfinReportSnapshotRow, userName: string, reportTitle: string): ReportSnapshot {
  return {
    id: row.id,
    reportId: row.report_id,
    companyId: row.company_id,
    userId: row.user_id,
    userName,
    reportTitle,
    format: row.format,
    status: row.status,
    fileUrl: row.fileUrl ?? null,
    signedUrl: row.signedUrl ?? null,
    fileSizeKb: row.fileSizeKb ?? null,
    errorMessage: row.errorMessage ?? null,
    expiresAt: row.expiresAt ?? null,
    requestedAt: row.requestedAt,
    generatedAt: row.generatedAt ?? null,
  };
}

export class RayfinExportService implements IExportService {
  async listMine(): Promise<ReportSnapshot[]> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const rows = await client.data.ReportSnapshot.findMany({
      user_id: { eq: userId },
    } as never);
    const mapped = await Promise.all(
      rows.map(async (r) => {
        const row = r as unknown as RayfinReportSnapshotRow;
        const [userName, reportTitle] = await Promise.all([
          getUserName(row.user_id),
          getReportTitle(row.report_id),
        ]);
        return mapRow(row, userName, reportTitle);
      }),
    );
    return mapped.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async getSignedUrl(snapshotId: string): Promise<{ url: string; expiresAt: string } | null> {
    const client = getRayfinClient();
    const row = await client.data.ReportSnapshot.findById(snapshotId);
    if (!row) return null;
    const snap = row as unknown as RayfinReportSnapshotRow;
    if (snap.status !== 'completed' || !snap.signedUrl) return null;
    return { url: snap.signedUrl, expiresAt: snap.expiresAt ?? new Date(Date.now() + 24 * 3_600_000).toISOString() };
  }
}
