import { entity, role, text, uuid, date, set, int, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type ConversationStatus = 'active' | 'archived' | 'deleted';

/**
 * Conversation — chat thread belonging to a single user.
 *
 * RLS:
 *   - Users see ONLY their own conversations (even Admin cannot see others').
 *   - Super_admin sees nothing in client workspaces (cross-tenant blind).
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class Conversation {
  @uuid() id!: string;
  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() user_id!: string;
  @one(() => User) user!: User;

  @text() title!: string;
  @int() messageCount!: number;
  @set('active', 'archived', 'deleted') status!: ConversationStatus;

  @date() lastMessageAt!: Date;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
