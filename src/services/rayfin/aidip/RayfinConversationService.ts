/**
 * Rayfin-backed AIDIP Conversation service.
 *
 * Conversations are user-scoped: RLS at the DAB layer enforces that
 * users see only their own conversations (policy: claims.sub eq user_id).
 */

import type { Conversation } from '@/lib/aidip/types';
import type { IConversationService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { nowIso } from './helpers';

interface RayfinConversationRow {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  messageCount: number;
  status: Conversation['status'];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: RayfinConversationRow): Conversation {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    title: row.title,
    messageCount: row.messageCount,
    status: row.status,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RayfinConversationService implements IConversationService {
  async list(): Promise<Conversation[]> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const rows = await client.data.Conversation.findMany({
      user_id: { eq: userId },
    } as never);
    return rows
      .filter((r) => (r as unknown as RayfinConversationRow).status !== 'deleted')
      .map((r) => mapRow(r as unknown as RayfinConversationRow))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  async get(id: string): Promise<Conversation | null> {
    const client = getRayfinClient();
    const row = await client.data.Conversation.findById(id);
    if (!row) return null;
    return mapRow(row as unknown as RayfinConversationRow);
  }

  async create(title?: string): Promise<Conversation> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');
    const now = nowIso();
    const row = await client.data.Conversation.create({
      company_id: companyId,
      user_id: userId,
      title: title ?? 'New conversation',
      messageCount: 0,
      status: 'active',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    } as never);
    return mapRow(row as unknown as RayfinConversationRow);
  }

  async rename(id: string, title: string): Promise<Conversation> {
    const client = getRayfinClient();
    const row = await client.data.Conversation.update(
      { id },
      { title, updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinConversationRow);
  }

  async archive(id: string): Promise<Conversation> {
    const client = getRayfinClient();
    const row = await client.data.Conversation.update(
      { id },
      { status: 'archived', updatedAt: nowIso() } as never,
    );
    return mapRow(row as unknown as RayfinConversationRow);
  }

  async softDelete(id: string): Promise<void> {
    const client = getRayfinClient();
    await client.data.Conversation.update(
      { id },
      { status: 'deleted', updatedAt: nowIso() } as never,
    );
  }
}
