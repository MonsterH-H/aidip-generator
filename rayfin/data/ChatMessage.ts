import { entity, role, text, uuid, date, set, int, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { Conversation } from './Conversation.js';
import { User } from './User.js';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatFeedback = 'positive' | 'negative';
export type ChatErrorKind = 'ai_unavailable' | 'fabric_unavailable' | 'timeout' | 'quota_exceeded' | 'empty_data';

/**
 * ChatMessage — a single message in a conversation (user OR assistant).
 *
 * `contentJson` stores the structured assistant response (text + visualization
 * + table + insights). For user messages, only `contentText` is set.
 *
 * RLS: derived from Conversation's policy — users can only access messages
 * belonging to their own conversations.
 */
@entity()
@role('authenticated', '*')
export class ChatMessage {
  @uuid() id!: string;
  @uuid() company_id!: string;
  @one(() => Company) company!: Company;

  @uuid() conversation_id!: string;
  @one(() => Conversation) conversation!: Conversation;

  @uuid() user_id!: string;
  @one(() => User) user!: User;

  @set('user', 'assistant') role!: ChatMessageRole;

  @text() contentText!: string;
  @text({ optional: true }) contentJson?: string; // serialized ChatMessageContent

  @text({ optional: true }) daxQuery?: string;
  @int({ optional: true }) tokensUsed?: number;
  @text({ optional: true }) modelUsed?: string;
  @int({ optional: true }) responseTimeMs?: number;

  @set('positive', 'negative') feedback?: ChatFeedback;
  @text({ optional: true }) feedbackReason?: string;

  @set('ai_unavailable', 'fabric_unavailable', 'timeout', 'quota_exceeded', 'empty_data') errorKind?: ChatErrorKind;

  @date() createdAt!: Date;
}
