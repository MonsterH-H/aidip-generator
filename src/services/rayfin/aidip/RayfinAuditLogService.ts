/**
 * Rayfin-backed AIDIP Audit Log service.
 *
 * RLS: super_admin sees all logs (cross-tenant); admin sees own company
 * only; analyst has no access (enforced at the route guard level).
 */

import type { AuditAction, AuditLog } from '@/lib/aidip/types';
import type { IAuditLogService } from '@/services/interfaces/IAidipServices';
import { AUDIT_ACTION_LABEL } from '@/lib/aidip/constants';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId } from './helpers-session';
import { parseJson } from './helpers';

interface RayfinAuditLogRow {
  id: string;
  company_id?: string | null;
  user_id?: string | null;
  userName: string;
  userType: 'super_admin' | 'admin' | 'analyst';
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  details: string;
  severity: 'info' | 'warning' | 'critical';
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

function mapRow(row: RayfinAuditLogRow): AuditLog {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    userId: row.user_id ?? null,
    userName: row.userName,
    userType: row.userType,
    action: row.action,
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    details: parseJson<Record<string, unknown>>(row.details) ?? {},
    severity: row.severity,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt,
  };
}

export class RayfinAuditLogService implements IAuditLogService {
  async list(filters?: {
    action?: AuditAction;
    userId?: string;
    from?: string;
    to?: string;
  }): Promise<AuditLog[]> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    const where: Record<string, unknown> = {};
    if (companyId) where.company_id = { eq: companyId };
    if (filters?.action) where.action = { eq: filters.action };
    if (filters?.userId) where.user_id = { eq: filters.userId };
    let rows = await client.data.AuditLog.findMany(where as never);
    if (filters?.from) rows = rows.filter((r) => (r as unknown as RayfinAuditLogRow).createdAt >= filters.from!);
    if (filters?.to) rows = rows.filter((r) => (r as unknown as RayfinAuditLogRow).createdAt <= filters.to!);
    return rows
      .map((r) => mapRow(r as unknown as RayfinAuditLogRow))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async exportCsv(): Promise<string> {
    const items = await this.list();
    const header = 'Date,User,Role,Action,Resource Type,Resource ID,Severity,IP Address\n';
    const rows = items.map((x) =>
      [
        x.createdAt,
        x.userName,
        x.userType,
        AUDIT_ACTION_LABEL[x.action] ?? x.action,
        x.resourceType ?? '',
        x.resourceId ?? '',
        x.severity,
        x.ipAddress ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    return header + rows.join('\n');
  }
}
