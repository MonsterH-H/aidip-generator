/**
 * AIDIP session hook.
 *
 * Bridges the auth layer (AuthContext — manages AuthUser) with the AIDIP
 * domain layer (returns the full AIDIP User with role, companyId, status).
 *
 * The Rayfin auth flow establishes the Microsoft Entra ID session; this
 * hook resolves the corresponding AIDIP User record (with role and
 * company_id) via `IUserService.getCurrent()`, which queries the Users
 * table filtered by `azure_ad_id`. RLS at the DAB layer ensures the
 * user can only see their own record (or company-scoped records if
 * they're an admin).
 */

import { useCallback, useEffect, useState } from 'react';

import type { SessionUser, User, ImpersonationSession } from '@/lib/aidip/types';
import { useAuth } from '@/hooks/AuthContext';
import { ServiceContainer } from '@/services/ServiceContainer';

export interface UseAidipSessionResult {
  /** The current AIDIP user (null if not signed in or not yet resolved). */
  user: User | null;
  /** Convenience: the role of the current user (null if not signed in). */
  role: User['role'] | null;
  /** Convenience: the company_id of the current user (null for super_admin). */
  companyId: string | null;
  /** Light-weight session user for guards / redirects. */
  sessionUser: SessionUser | null;
  /** True while the session is being resolved on mount. */
  loading: boolean;
  /** Active impersonation session (null if not impersonating). */
  impersonation: ImpersonationSession | null;
  /** Refresh the session from the service. */
  refresh: () => Promise<void>;
}

export function useAidipSession(): UseAidipSessionResult {
  const { user: authUser, loading: authLoading } = useAuth();
  const [aidipUser, setAidipUser] = useState<User | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!authUser) {
      setAidipUser(null);
      setImpersonation(null);
      setLoading(false);
      return;
    }
    try {
      const services = ServiceContainer.getInstance().aidip;
      const [u, imp] = await Promise.all([
        services.user.getCurrent(),
        services.impersonation.current(),
      ]);
      setAidipUser(u);
      setImpersonation(imp.active ? imp.session ?? null : null);
    } catch (err) {
      console.error('Failed to load AIDIP session:', err);
      setAidipUser(null);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authUser, authLoading, refresh]);

  const sessionUser: SessionUser | null = aidipUser
    ? {
        id: aidipUser.id,
        email: aidipUser.email,
        fullName: aidipUser.fullName,
        role: aidipUser.role,
        companyId: aidipUser.companyId,
        status: aidipUser.status,
      }
    : null;

  return {
    user: aidipUser,
    role: aidipUser?.role ?? null,
    companyId: aidipUser?.companyId ?? null,
    sessionUser,
    loading: authLoading || loading,
    impersonation,
    refresh,
  };
}
