/**
 * AIDIP route guards.
 *
 * Built on top of the existing `useAuth` + `useAidipSession` hooks.
 * Three guard levels:
 *   - `RequireAuth` — any authenticated user (analyst / admin / super_admin)
 *   - `RequireRole` — only specified roles (used for /admin/* and /super-admin/*)
 *   - `RoleRedirect` — sends the user to the correct landing page for their role
 *
 * Per CDC §4 (Module 1) and §5 (Module 2):
 *   - Inactive session → /auth
 *   - Authenticated user with no AIDIP session yet → /auth (loading state shown)
 *   - User with wrong role hitting a guarded route → /access-denied or /dashboard
 */

import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import type { UserRole } from '@/lib/aidip/types';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';

import { FullScreenLoader } from './FullScreenLoader';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { loading, user } = useAidipSession();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader label="Loading your workspace…" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  // Suspended users see access-denied
  if (user.status === 'suspended') {
    return <Navigate to="/access-denied?reason=suspended" replace />;
  }

  return <>{children}</>;
}

interface RequireRoleProps {
  allowed: UserRole[];
  children: React.ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { loading, user } = useAidipSession();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader label="Verifying access…" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (!allowed.includes(user.role)) {
    // Wrong role — redirect to their dashboard with a notice
    return <Navigate to="/dashboard?error=forbidden" replace />;
  }

  return <>{children}</>;
}

/**
 * Redirects the user to the right landing page based on their role.
 * Used at the `/` route.
 */
export function RoleRedirect() {
  const { loading, user } = useAidipSession();

  if (loading) {
    return <FullScreenLoader label="Loading your workspace…" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (user.status === 'suspended') {
    return <Navigate to="/access-denied?reason=suspended" replace />;
  }

  if (user.role === 'super_admin') {
    return <Navigate to="/super-admin/dashboard" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

/** Re-export Loader2 for convenience. */
export { Loader2 };
