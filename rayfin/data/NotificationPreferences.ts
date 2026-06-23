import { entity, role, text, uuid, date, set, int, boolean, one } from '@microsoft/rayfin-core';
import { Company } from './Company.js';
import { User } from './User.js';

export type EmailFrequency = 'immediate' | 'daily' | 'weekly';

/**
 * NotificationPreferences — per-user notification settings.
 *
 * RLS: users manage ONLY their own preferences (1:1 with User).
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class NotificationPreferences {
  @uuid() id!: string;
  @uuid() user_id!: string;
  @one(() => User) user!: User;

  @uuid({ optional: true }) company_id?: string;
  @one(() => Company, { optional: true }) company?: Company;

  @boolean({ default: true }) emailEnabled!: boolean;
  @set('immediate', 'daily', 'weekly') emailFrequency!: EmailFrequency;
  @boolean({ default: true }) inappEnabled!: boolean;

  @boolean({ default: false }) dndEnabled!: boolean;
  @int() dndStartHour!: number; // 0-23
  @int() dndEndHour!: number; // 0-23

  @text() typesDisabled!: string; // JSON: NotificationType[]

  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
