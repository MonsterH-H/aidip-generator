/**
 * Rayfin-backed AIDIP Impersonation service.
 *
 * Impersonation is implemented as a server-side Rayfin function that
 * mints a short-lived session token scoped to the target user. The
 * function enforces:
 *   - super_admin role check
 *   - mandatory justification (min 10 chars)
 *   - 30-minute max duration
 *   - full audit logging
 *
 * The client-side `current()` call queries the session endpoint to check
 * if the current session is impersonated (and returns the active
 * session metadata for the banner UI).
 */

import type { ImpersonationSession } from '@/lib/aidip/types';
import type { IImpersonationService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentUserId } from './helpers-session';
import { IMPERSONATE_MAX_DURATION_MINUTES } from '@/lib/aidip/constants';

export class RayfinImpersonationService implements IImpersonationService {
  async start(targetUserId: string, reason: string): Promise<{ ok: boolean; message?: string }> {
    if (!reason || reason.trim().length < 10) {
      return { ok: false, message: 'A justification of at least 10 characters is required.' };
    }
    const client = getRayfinClient();
    try {
      const result = await client.functions.startImpersonation.invoke({ targetUserId, reason });
      if (result.ok && result.session) {
        // The server-side function mints a new session token scoped to
        // the target user. The browser reload below picks it up.
      }
      return { ok: result.ok, message: result.message };
    } catch (err) {
      console.error('startImpersonation failed:', err);
      return { ok: false, message: 'Failed to start impersonation. Please try again.' };
    }
  }

  async end(): Promise<void> {
    const client = getRayfinClient();
    try {
      await client.functions.endImpersonation.invoke();
      // The server-side function restores the original super_admin session
      // token. The browser reload in the UI picks it up.
    } catch (err) {
      console.error('endImpersonation failed:', err);
    }
  }

  async current(): Promise<{ active: boolean; session?: ImpersonationSession }> {
    const client = getRayfinClient();
    try {
      const state = await client.functions.getImpersonationState.invoke();
      if (!state.active || !state.session) return { active: false };
      return {
        active: true,
        session: {
          ...state.session,
          superAdminId: state.session.superAdminId ?? getCurrentUserId(),
          expiresAt: new Date(
            new Date(state.session.startedAt).getTime() +
              IMPERSONATE_MAX_DURATION_MINUTES * 60_000,
          ).toISOString(),
        },
      };
    } catch (err) {
      console.error('getImpersonationState failed:', err);
      return { active: false };
    }
  }
}
