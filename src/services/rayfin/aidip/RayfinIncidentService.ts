/**
 * Rayfin-backed AIDIP Incident service.
 *
 * Incidents are super_admin-only entities (RLS: super_admin role).
 * Creation triggers notifications to all admins of impacted companies.
 */

import type { Incident } from '@/lib/aidip/types';
import type { IIncidentService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { nowIso, parseJson, stringifyJson } from './helpers';
import { pushNotification, recordAudit } from './audit-helpers';

interface RayfinIncidentRow {
  id: string;
  title: string;
  severity: Incident['severity'];
  status: Incident['status'];
  description: string;
  impactedCompanyIds: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  postMortem?: string | null;
}

function mapRow(row: RayfinIncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    description: row.description,
    impactedCompanyIds: parseJson<string[]>(row.impactedCompanyIds) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt ?? null,
    postMortem: row.postMortem ?? null,
  };
}

export class RayfinIncidentService implements IIncidentService {
  async list(): Promise<Incident[]> {
    const client = getRayfinClient();
    const rows = await client.data.Incident.findMany();
    return rows
      .map((r) => mapRow(r as unknown as RayfinIncidentRow))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: {
    title: string;
    severity: Incident['severity'];
    description: string;
    impactedCompanyIds: string[];
  }): Promise<Incident> {
    const client = getRayfinClient();
    const now = nowIso();
    const row = await client.data.Incident.create({
      title: input.title,
      severity: input.severity,
      status: 'investigating',
      description: input.description,
      impactedCompanyIds: stringifyJson(input.impactedCompanyIds),
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      postMortem: null,
    } as never);
    const incident = mapRow(row as unknown as RayfinIncidentRow);

    // Notify admins of impacted companies.
    for (const cid of input.impactedCompanyIds) {
      const admins = await client.data.User.findMany({
        company_id: { eq: cid },
        role: { eq: 'admin' },
        status: { eq: 'active' },
      } as never);
      for (const a of admins) {
        await pushNotification(
          (a as unknown as { id: string }).id,
          'incident_platform',
          `New ${input.severity} incident: ${input.title}`,
          input.description,
          null,
          null,
        );
      }
    }
    return incident;
  }

  async updateStatus(id: string, status: Incident['status']): Promise<Incident> {
    const client = getRayfinClient();
    const update: Record<string, unknown> = { status, updatedAt: nowIso() };
    if (status === 'resolved') update.resolvedAt = nowIso();
    const row = await client.data.Incident.update({ id }, update as never);
    return mapRow(row as unknown as RayfinIncidentRow);
  }

  async resolve(id: string, postMortem: string): Promise<Incident> {
    const client = getRayfinClient();
    const now = nowIso();
    const row = await client.data.Incident.update(
      { id },
      {
        status: 'resolved',
        resolvedAt: now,
        postMortem,
        updatedAt: now,
      } as never,
    );
    return mapRow(row as unknown as RayfinIncidentRow);
  }
}

export { recordAudit };
