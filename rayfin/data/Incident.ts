import { entity, role, text, uuid, date, set } from '@microsoft/rayfin-core';

export type IncidentSeverity = 'critical' | 'major' | 'minor';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

/**
 * Incident — platform incident managed by Super Admin (HESYD).
 *
 * `impactedCompanyIds` is a JSON-serialized string array.
 *
 * Access is restricted to authenticated users; row-level visibility
 * (super_admin only) is enforced at the DAB policy layer.
 */
@entity()
@role('authenticated', '*')
export class Incident {
  @uuid() id!: string;
  @text() title!: string;

  @set('critical', 'major', 'minor') severity!: IncidentSeverity;
  @set('investigating', 'identified', 'monitoring', 'resolved') status!: IncidentStatus;

  @text() description!: string;
  @text() impactedCompanyIds!: string; // JSON: string[]

  @date() createdAt!: Date;
  @date() updatedAt!: Date;
  @date({ optional: true }) resolvedAt?: Date;
  @text({ optional: true }) postMortem?: string;
}
