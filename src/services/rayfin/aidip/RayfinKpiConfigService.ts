/**
 * Rayfin-backed AIDIP KPI Config service.
 *
 * Admin Entreprise configures up to MAX_DASHBOARD_KPIS (4) KPIs visible
 * company-wide. Configurations are persisted in the KpiConfig entity;
 * the live values are fetched by the analytics service at query time.
 */

import type { KpiCard } from '@/lib/aidip/types';
import type { IKpiConfigService } from '@/services/interfaces/IAidipServices';
import { MAX_DASHBOARD_KPIS } from '@/lib/aidip/constants';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId } from './helpers-session';
import { nowIso, parseJson, stringifyJson } from './helpers';
import { recordAudit } from './audit-helpers';

interface RayfinKpiConfigRow {
  id: string;
  company_id: string;
  title: string;
  icon: KpiCard['icon'];
  valueType: KpiCard['valueType'];
  format: string;
  source?: string | null;
  dabQuery?: string | null;
  comparisonConfig: string;
  sparklineConfig: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: RayfinKpiConfigRow): KpiCard {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    valueType: row.valueType,
    value: 0, // populated by analytics service at query time
    format: row.format,
    comparison: parseJson<{ value: number; label: string } | null>(row.comparisonConfig),
    sparkline: parseJson<number[]>(row.sparklineConfig) ?? [],
    source: row.source ?? undefined,
    dabQuery: row.dabQuery ?? undefined,
  };
}

export class RayfinKpiConfigService implements IKpiConfigService {
  async list(): Promise<KpiCard[]> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) return [];
    const rows = await client.data.KpiConfig.findMany({
      company_id: { eq: companyId },
    } as never);
    return rows.map((r) => mapRow(r as unknown as RayfinKpiConfigRow));
  }

  async create(input: Omit<KpiCard, 'id'>): Promise<KpiCard> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const existing = await this.list();
    if (existing.length >= MAX_DASHBOARD_KPIS) {
      throw new Error(`Maximum KPI limit reached (${MAX_DASHBOARD_KPIS}).`);
    }
    const now = nowIso();
    const row = await client.data.KpiConfig.create({
      company_id: companyId,
      title: input.title,
      icon: input.icon,
      valueType: input.valueType,
      format: input.format,
      source: input.source ?? null,
      dabQuery: input.dabQuery ?? null,
      comparisonConfig: stringifyJson(input.comparison ?? null),
      sparklineConfig: stringifyJson(input.sparkline ?? []),
      createdAt: now,
      updatedAt: now,
    } as never);
    const kpi = mapRow(row as unknown as RayfinKpiConfigRow);
    await recordAudit('settings_updated', 'kpi', kpi.id, { title: kpi.title });
    return kpi;
  }

  async update(id: string, patch: Partial<KpiCard>): Promise<KpiCard> {
    const client = getRayfinClient();
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.icon !== undefined) update.icon = patch.icon;
    if (patch.valueType !== undefined) update.valueType = patch.valueType;
    if (patch.format !== undefined) update.format = patch.format;
    if (patch.source !== undefined) update.source = patch.source;
    if (patch.dabQuery !== undefined) update.dabQuery = patch.dabQuery;
    if (patch.comparison !== undefined) update.comparisonConfig = stringifyJson(patch.comparison);
    if (patch.sparkline !== undefined) update.sparklineConfig = stringifyJson(patch.sparkline);
    const row = await client.data.KpiConfig.update({ id }, update as never);
    return mapRow(row as unknown as RayfinKpiConfigRow);
  }

  async remove(id: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.KpiConfig.delete({ id });
  }
}
