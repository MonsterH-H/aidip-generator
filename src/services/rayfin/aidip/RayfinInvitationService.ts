/**
 * Rayfin-backed AIDIP Invitation service.
 *
 * Manages user invitations within the current session's company scope.
 * Validates tokens, enforces max_users quota, and triggers notification
 * creation on send / accept.
 */

import type { Invitation, InvitationInput, UserRole } from '@/lib/aidip/types';
import type { IInvitationService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { nowIso } from './helpers';
import { pushNotification, recordAudit } from './audit-helpers';

interface RayfinInvitationRow {
  id: string;
  company_id: string;
  invitedBy: string;
  email: string;
  role: UserRole;
  token: string;
  tokenHash: string;
  personalMessage?: string | null;
  status: Invitation['status'];
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
}

function mapRow(row: RayfinInvitationRow, invitedByName: string): Invitation {
  return {
    id: row.id,
    companyId: row.company_id,
    invitedBy: row.invitedBy,
    invitedByName,
    email: row.email,
    role: row.role,
    token: row.token,
    personalMessage: row.personalMessage ?? null,
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt ?? null,
    createdAt: row.createdAt,
  };
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getInviterName(invitedBy: string): Promise<string> {
  const client = getRayfinClient();
  const u = await client.data.User.findById(invitedBy);
  return (u as unknown as { fullName?: string } | null)?.fullName ?? 'Unknown';
}

export class RayfinInvitationService implements IInvitationService {
  async listByCompany(): Promise<Invitation[]> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) return [];
    const rows = await client.data.Invitation.findMany({
      company_id: { eq: companyId },
    } as never);
    const sorted = rows.sort(
      (a, b) =>
        (b as unknown as RayfinInvitationRow).createdAt.localeCompare(
          (a as unknown as RayfinInvitationRow).createdAt,
        ),
    );
    return Promise.all(
      sorted.map(async (r) =>
        mapRow(
          r as unknown as RayfinInvitationRow,
          await getInviterName((r as unknown as RayfinInvitationRow).invitedBy),
        ),
      ),
    );
  }

  async create(input: InvitationInput): Promise<Invitation> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const inviterId = getCurrentUserId();

    // Validate: no existing user with this email in the company.
    const existingUsers = await client.data.User.findMany({
      email: { eq: input.email.toLowerCase() },
      company_id: { eq: companyId },
    } as never);
    if (existingUsers.length > 0) {
      throw new Error('An account with this email already exists in your company.');
    }

    // Validate: no pending invitation for this email.
    const existingInvites = await client.data.Invitation.findMany({
      email: { eq: input.email.toLowerCase() },
      company_id: { eq: companyId },
      status: { eq: 'pending' },
    } as never);
    if (existingInvites.length > 0) {
      throw new Error('A pending invitation already exists for this email.');
    }

    // Validate: max_users quota not exceeded.
    const company = await client.data.Company.findById(companyId);
    const activeUsers = await client.data.User.findMany({
      company_id: { eq: companyId },
      status: { eq: 'active' },
    } as never);
    const maxUsers = (company as unknown as { maxUsers: number })?.maxUsers ?? 0;
    if (activeUsers.length >= maxUsers) {
      throw new Error(
        `Maximum user limit reached (${maxUsers}). Upgrade your plan to invite more members.`,
      );
    }

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + input.validityDays * 86_400_000).toISOString();

    const row = await client.data.Invitation.create({
      company_id: companyId,
      invitedBy: inviterId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      tokenHash,
      personalMessage: input.personalMessage ?? null,
      status: 'pending',
      expiresAt,
      acceptedAt: null,
      createdAt: now,
    } as never);

    const inv = mapRow(row as unknown as RayfinInvitationRow, await getInviterName(inviterId));
    await recordAudit('invitation_sent', 'invitation', inv.id, {
      email: inv.email,
      role: inv.role,
    });
    await pushNotification(inviterId, 'invitation_sent', 'Invitation sent', `An invitation has been sent to ${inv.email}.`, '/admin/team', 'View team');
    return inv;
  }

  async resend(id: string): Promise<Invitation> {
    const client = getRayfinClient();
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const row = await client.data.Invitation.update(
      { id },
      { token, tokenHash, status: 'pending', expiresAt, createdAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinInvitationRow, await getInviterName((row as unknown as RayfinInvitationRow).invitedBy));
  }

  async cancel(id: string): Promise<Invitation> {
    const client = getRayfinClient();
    const row = await client.data.Invitation.update({ id }, { status: 'cancelled' } as never);
    return mapRow(row as unknown as RayfinInvitationRow, await getInviterName((row as unknown as RayfinInvitationRow).invitedBy));
  }

  async validateToken(token: string): Promise<{ valid: boolean; invitation?: Invitation; reason?: string }> {
    const client = getRayfinClient();
    const tokenHash = await hashToken(token);
    const rows = await client.data.Invitation.findMany({
      tokenHash: { eq: tokenHash },
    } as never);
    if (rows.length === 0) {
      return { valid: false, reason: 'Invitation not found. Please check your invitation link.' };
    }
    const inv = rows[0] as unknown as RayfinInvitationRow;
    if (inv.status === 'accepted') {
      return { valid: false, reason: 'This invitation has already been used.', invitation: await this.toInvitation(inv) };
    }
    if (inv.status === 'cancelled') {
      return { valid: false, reason: 'This invitation has been cancelled by the administrator.', invitation: await this.toInvitation(inv) };
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      await client.data.Invitation.update({ id: inv.id }, { status: 'expired' } as never);
      return { valid: false, reason: 'This invitation has expired. Please contact your administrator for a new invitation.', invitation: await this.toInvitation(inv) };
    }
    return { valid: true, invitation: await this.toInvitation(inv) };
  }

  async accept(token: string): Promise<{ ok: boolean; message?: string }> {
    const v = await this.validateToken(token);
    if (!v.valid || !v.invitation) return { ok: false, message: v.reason };
    const client = getRayfinClient();
    await client.data.Invitation.update(
      { id: v.invitation.id },
      { status: 'accepted', acceptedAt: nowIso() } as never,
    );
    await pushNotification(v.invitation.invitedBy, 'invitation_accepted', 'Invitation accepted', `${v.invitation.email} has accepted the invitation.`, '/admin/team', 'View team');
    return { ok: true };
  }

  private async toInvitation(row: RayfinInvitationRow): Promise<Invitation> {
    return mapRow(row, await getInviterName(row.invitedBy));
  }
}
