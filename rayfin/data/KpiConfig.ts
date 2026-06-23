import { entity, role, text, uuid, date, set, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';

export type KpiIcon = 'revenue' | 'inventory' | 'customers' | 'growth' | 'queries' | 'users' | 'reports' | 'uptime';
export type KpiValueType = 'amount' | 'percentage' | 'integer';

/**
 * KpiConfig — company-wide KPI configuration for the dashboard.
 *
 * Admin Entreprise configures up to MAX_DASHBOARD_KPIS (4) KPIs visible
 * to all company members. The value/sparkline/comparison fields are
 * populated by the analytics service (live from Fabric) at query time,
 * NOT stored here — only the *config* is persisted.
 *
 * RLS:
 *   - admin: CRUD own company's KPIs
 *   - analyst: read own company's KPIs
 */
@entity()
@role('authenticated', '*')
export class KpiConfig {
  @uuid() id!: string;
  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @text() title!: string;
  @set('revenue', 'inventory', 'customers', 'growth', 'queries', 'users', 'reports', 'uptime') icon!: KpiIcon;
  @set('amount', 'percentage', 'integer') valueType!: KpiValueType;

  @text() format!: string; // "MAD", "%", "integer"
  @text({ optional: true }) source?: string;
  @text({ optional: true }) dabQuery?: string;

  // Comparison + sparkline config stored as JSON (the actual values are
  // computed at query time, not stored).
  @text() comparisonConfig!: string; // JSON: { label: string } | null
  @text() sparklineConfig!: string; // JSON: { source: string } | null

  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
