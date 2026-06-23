/**
 * Rayfin-backed AIDIP User service.
 *
 * Manages user records within the current session's company scope.
 * Super_admin operations are cross-tenant (no company_id filter).
 */

import type { User, UserRole, UserStatus } from '@/lib/aidip/types';
import type { IUserService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentUserId, nowIso } from './helpers';

interface RayfinUserRow {
  id: string;
  company_id?: string | null;
  email: string;
  fullName: string;
  azureAdId?: string | null;
  role: UserRole;
  status: UserStatus;
  lastLogin?: string | null;
  queriesToday: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: RayfinUserRow): User {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    email: row.email,
    fullName: row.fullName,
    azureAdId: row.azureAdId ?? null,
    role: row.role,
    status: row.status,
    lastLogin: row.lastLogin ?? null,
    queriesToday: row.queriesToday,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RayfinUserService implements IUserService {
  async getCurrent(): Promise<User | null> {
    const client = getRayfinClient();
    const session = client.auth.getSession();
    if (!session.isAuthenticated || !session.user) return null;
    // The AIDIP User row keyed by azure_ad_id = session.user.id is fetched
    // via a `where` filter. RLS at the DAB layer ensures the user can only
    // see their own row (or company rows if admin).
    const rows = await client.data.User.findMany({
      azureAdId: { eq: session.user.id },
    } as never);
    if (rows.length === 0) return null;
    return mapRow(rows[0] as unknown as RayfinUserRow);
  }

  async listByCompany(filters?: {
    role?: UserRole;
    status?: UserStatus;
    search?: string;
  }): Promise<User[]> {
    const me = await this.getCurrent();
    if (!me?.companyId) return [];
    return this.listByCompanyId(me.companyId, filters);
  }

  async listByCompanyId(
    companyId: string,
    filters?: {
      role?: UserRole;
      status?: UserStatus;
      search?: string;
    },
  ): Promise<User[]> {
    const client = getRayfinClient();
    const where: Record<string, unknown> = { company_id: { eq: companyId } };
    if (filters?.role) where.role = { eq: filters.role };
    if (filters?.status) where.status = { eq: filters.status };
    let rows = await client.data.User.findMany(where as never);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r as unknown as RayfinUserRow).fullName.toLowerCase().includes(q) ||
          (r as unknown as RayfinUserRow).email.toLowerCase().includes(q),
      );
    }
    return rows
      .filter((r) => (r as unknown as RayfinUserRow).status !== 'deleted')
      .map((r) => mapRow(r as unknown as RayfinUserRow))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async get(id: string): Promise<User | null> {
    const client = getRayfinClient();
    const row = await client.data.User.findById(id);
    if (!row) return null;
    return mapRow(row as unknown as RayfinUserRow);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const client = getRayfinClient();
    const row = await client.data.User.update(
      { id },
      { role, updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinUserRow);
  }

  async suspend(id: string): Promise<User> {
    const client = getRayfinClient();
    const row = await client.data.User.update(
      { id },
      { status: 'suspended', updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinUserRow);
  }

  async reactivate(id: string): Promise<User> {
    const client = getRayfinClient();
    const row = await client.data.User.update(
      { id },
      { status: 'active', updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinUserRow);
  }

  async softDelete(id: string, transferReportsToUserId?: string): Promise<User> {
    const client = getRayfinClient();
    // Optionally reassign reports to another user before soft-deleting.
    if (transferReportsToUserId) {
      const reports = await client.data.Report.findMany({
        user_id: { eq: id },
      } as never);
      for (const r of reports) {
        await client.data.Report.update(
          { id: (r as unknown as { id: string }).id },
          { user_id: transferReportsToUserId, updatedAt: nowIso() } as never,
        );
      }
    }
    const row = await client.data.User.update(
      { id },
      { status: 'deleted', deletedAt: nowIso(), updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinUserRow);
  }
}

/** Returns the current user's company_id (or null for super_admin). */
export async function getCurrentCompanyId(): Promise<string | null> {
  const svc = new RayfinUserService();
  const u = await svc.getCurrent();
  return u?.companyId ?? null;
}

/** Re-exported for callers that need just the user id without a full fetch. */
export { getCurrentUserId };
