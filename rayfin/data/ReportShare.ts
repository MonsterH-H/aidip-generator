import { entity, role, text, uuid, date, set, boolean, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { Report } from './Report.js';
import { User } from './User.js';

/**
 * ReportShare — sharing relationship between a report and a recipient.
 *
 * RLS:
 *   - shared_with user: read own shares
 *   - report owner: read/write own report's shares
 *   - admin: read/write all company shares
 */
@entity()
@role('authenticated', '*')
export class ReportShare {
  @uuid() id!: string;
  @uuid() report_id!: string;
  @one(() => Report) report!: Report;

  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() sharedBy!: string;
  @one(() => User) sharedByUser!: User;

  @uuid() sharedWith!: string;
  @one(() => User) sharedWithUser!: User;

  @set('read', 'write') permission!: 'read' | 'write';
  @boolean({ default: true }) allowDownload!: boolean;
  @boolean({ default: false }) allowReshare!: boolean;

  @text({ optional: true }) personalMessage?: string;
  @date({ optional: true }) expiresAt?: Date;

  @date() createdAt!: Date;
}
