/**
 * AIDIP shell — wraps AppShell with role-aware navigation config.
 *
 * Per CDC §2 (Espaces Utilisateurs): each role has its own sidebar layout.
 */

import type { UserRole } from '@/lib/aidip/types';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { useNotifications } from '@/hooks/aidip/useNotifications';

import { AppShell } from '@/components/layout/AppShell';
import type { SidebarNavGroup } from '@/components/layout/SidebarNav';

interface AidipShellProps {
  children: React.ReactNode;
  /** Override the role used to pick the sidebar (defaults to current user's role). */
  roleOverride?: UserRole;
}

export function AidipShell({ children, roleOverride }: AidipShellProps) {
  const { user, role } = useAidipSession();
  const { unreadCount } = useNotifications();

  const effectiveRole = roleOverride ?? role;
  if (!effectiveRole) {
    return <>{children}</>;
  }

  const nav = getNavForRole(effectiveRole, unreadCount);
  const companyName =
    user?.companyId === 'comp-atlas'
      ? 'Atlas Logistics'
      : user?.companyId === 'comp-meridian'
        ? 'Meridian Retail'
        : user?.companyId === 'comp-casamed'
          ? 'CasaMed Healthcare'
          : user?.companyId === 'comp-hesyd'
            ? 'HESYD'
            : undefined;

  return (
    <AppShell navItems={nav} headerBadge={companyName}>
      {children}
    </AppShell>
  );
}

function getNavForRole(role: UserRole, unreadCount: number): SidebarNavGroup[] {
  if (role === 'super_admin') {
    return [
      {
        label: 'Platform',
        items: [
          { label: 'Dashboard', to: '/super-admin/dashboard', icon: 'LayoutDashboard' },
          { label: 'Companies', to: '/super-admin/companies', icon: 'Building2' },
          { label: 'AI Monitoring', to: '/super-admin/monitoring', icon: 'Cpu' },
        ],
      },
      {
        label: 'Account',
        items: [
          { label: 'Notifications', to: '/notifications', icon: 'Bell', badge: unreadCount },
          { label: 'My Profile', to: '/profile', icon: 'User' },
          { label: 'Help', to: '/help', icon: 'HelpCircle' },
        ],
      },
    ];
  }

  if (role === 'admin') {
    return [
      {
        label: 'Workspace',
        items: [
          { label: 'Dashboard', to: '/dashboard', icon: 'LayoutDashboard' },
          { label: 'Conversations', to: '/chat', icon: 'MessageSquare' },
          { label: 'Reports', to: '/reports', icon: 'FileText' },
        ],
      },
      {
        label: 'Administration',
        items: [
          { label: 'Team', to: '/admin/team', icon: 'Users' },
          { label: 'Analytics', to: '/admin/analytics', icon: 'BarChart3' },
          { label: 'Settings', to: '/admin/settings', icon: 'Settings' },
        ],
      },
      {
        label: 'Account',
        items: [
          { label: 'Notifications', to: '/notifications', icon: 'Bell', badge: unreadCount },
          { label: 'My Profile', to: '/profile', icon: 'User' },
          { label: 'Help', to: '/help', icon: 'HelpCircle' },
        ],
      },
    ];
  }

  // analyst
  return [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', to: '/dashboard', icon: 'LayoutDashboard' },
        { label: 'Conversations', to: '/chat', icon: 'MessageSquare' },
        { label: 'Reports', to: '/reports', icon: 'FileText' },
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'Notifications', to: '/notifications', icon: 'Bell', badge: unreadCount },
        { label: 'My Profile', to: '/profile', icon: 'User' },
        { label: 'Help', to: '/help', icon: 'HelpCircle' },
      ],
    },
  ];
}
