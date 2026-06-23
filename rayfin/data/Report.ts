import { entity, role, text, uuid, date, set, boolean, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type ReportStatus = 'draft' | 'published' | 'archived' | 'deleted';
export type ReportVisibility = 'private' | 'shared' | 'company' | 'official';

/**
 * Report — dynamic report (structure only, data is recomputed live).
 *
 * `structureJson` stores visual configs + DAB queries ONLY — never raw data.
 * The `tags` field is a JSON-serialized string array.
 *
 * RLS:
 *   - admin: read/write all company reports
 *   - analyst: read own + shared-with-me + official; write own only
 *   - super_admin: read all (for support)
 */
@entity()
@role('authenticated', '*')
export class Report {
  @uuid() id!: string;
  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() user_id!: string;
  @one(() => User) owner!: User;

  @text() title!: string;
  @text({ optional: true }) description?: string;

  @set('draft', 'published', 'archived', 'deleted') status!: ReportStatus;
  @set('private', 'shared', 'company', 'official') visibility!: ReportVisibility;

  @boolean({ default: false }) isOfficial!: boolean;
  @uuid({ optional: true }) pinnedBy?: string;
  @date({ optional: true }) pinnedAt?: Date;

  // structureJson + tags are stored as text; service layer serializes/deserializes.
  @text() structureJson!: string; // JSON: { sections: [...] } — bounded by 500KB MVP limit
  @text() tags!: string; // JSON: string[]

  @date({ optional: true }) deletedAt?: Date;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
