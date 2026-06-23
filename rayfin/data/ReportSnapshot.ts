import { entity, role, text, uuid, date, set, int, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { Report } from './Report.js';
import { User } from './User.js';

export type ExportFormat = 'pdf' | 'ppt';
export type ExportStatus = 'processing' | 'completed' | 'failed';

/**
 * ReportSnapshot — async export job + its generated file metadata.
 *
 * The actual file lives in client Fabric storage; only the metadata
 * (URL, signed URL, size, status, expiration) is persisted here.
 *
 * RLS: user reads own snapshots; admin reads all company snapshots.
 */
@entity()
@role('authenticated', '*')
export class ReportSnapshot {
  @uuid() id!: string;
  @uuid() report_id!: string;
  @one(() => Report) report!: Report;

  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() user_id!: string;
  @one(() => User) user!: User;

  @set('pdf', 'ppt') format!: ExportFormat;
  @set('processing', 'completed', 'failed') status!: ExportStatus;

  @text({ optional: true }) fileUrl?: string;
  @text({ optional: true }) signedUrl?: string;
  @int({ optional: true }) fileSizeKb?: number;
  @text({ optional: true }) errorMessage?: string;

  @date({ optional: true }) expiresAt?: Date;
  @date() requestedAt!: Date;
  @date({ optional: true }) generatedAt?: Date;
}
