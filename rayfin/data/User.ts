import { entity, role, text, uuid, date, set, int, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';

export type UserRole = 'super_admin' | 'admin' | 'analyst';
export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';

/**
 * User — AIDIP platform user.
 *
 * RLS:
 *   - super_admin: full access (cross-tenant; company_id is NULL)
 *   - admin: read/update own company members (scoped by company_id)
 *   - analyst: read own record only
 *
 * Note: the `azure_ad_id` field links the AIDIP User to the Entra ID
 * account established during SSO sign-in.
 */
@entity()
@role('authenticated', '*')
export class User {
  @uuid() id!: string;
  @uuid({ optional: true }) company_id?: string;
  @one(() => Company, { optional: true }) company?: Company;

  @text() email!: string;
  @text() fullName!: string;
  @text({ optional: true }) azureAdId?: string;

  @set('super_admin', 'admin', 'analyst') role!: UserRole;
  @set('active', 'suspended', 'pending', 'deleted') status!: UserStatus;

  @date({ optional: true }) lastLogin?: Date;
  @int() queriesToday!: number;

  @date({ optional: true }) deletedAt?: Date;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
