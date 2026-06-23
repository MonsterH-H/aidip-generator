/**
 * Session-scoped helpers for Rayfin AIDIP services.
 *
 * Wraps the user/company-id lookups so service implementations stay
 * focused on business logic.
 */

import { getCurrentUserId } from './helpers';
import { RayfinUserService } from './RayfinUserService';

export { getCurrentUserId };

/** Returns the current session user's company_id (or null for super_admin). */
export async function getCurrentCompanyId(): Promise<string | null> {
  const svc = new RayfinUserService();
  const u = await svc.getCurrent();
  return u?.companyId ?? null;
}
