import { entity, role, text, uuid, date, set, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

/**
 * Invitation — pending user invitations created by Admin Entreprise.
 *
 * RLS:
 *   - admin: CRUD own company's invitations
 *   - analyst: no access
 *   - super_admin: read all (for support)
 */
@entity()
@role('authenticated', '*')
export class Invitation {
  @uuid() id!: string;
  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() invitedBy!: string;
  @one(() => User) invitedByUser!: User;

  @text() email!: string;
  @set('super_admin', 'admin', 'analyst') role!: 'super_admin' | 'admin' | 'analyst';

  @text() token!: string;
  @text() tokenHash!: string;
  @text({ optional: true }) personalMessage?: string;

  @set('pending', 'accepted', 'expired', 'cancelled') status!: InvitationStatus;

  @date() expiresAt!: Date;
  @date({ optional: true }) acceptedAt?: Date;
  @date() createdAt!: Date;
}
