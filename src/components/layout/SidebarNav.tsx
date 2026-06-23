/**
 * Sidebar navigation — used by AppShell for both desktop sidebar and mobile drawer.
 *
 * Premium enterprise styling: subtle hover, active state with left border +
 * primary tint, grouped sections, footer with quota indicator.
 */

import { Link, useLocation } from 'react-router-dom';
import { lucideIcons } from '@/lib/aidip/navIcons';

export interface SidebarNavItem {
  label: string;
  /** Path the item links to. */
  to: string;
  /** Lucide icon name (string lookup). */
  icon: keyof typeof lucideIcons;
  /** Optional badge count (e.g. unread notifications). */
  badge?: number;
  /** Whether this item should be hidden (e.g. role-gated). */
  hidden?: boolean;
}

export interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

interface SidebarNavProps {
  items: SidebarNavItem[] | SidebarNavGroup[];
}

function isGrouped(items: SidebarNavProps['items']): items is SidebarNavGroup[] {
  return Array.isArray(items) && items.length > 0 && 'items' in items[0]!;
}

export function SidebarNav({ items }: SidebarNavProps) {
  const location = useLocation();
  const groups = isGrouped(items) ? items : [{ items }];

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Sidebar">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.label && (
            <div className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
          )}
          {group.items.filter((i) => !i.hidden).map((item) => {
            const Icon = lucideIcons[item.icon] ?? lucideIcons.Circle;
            const active = isActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                ].join(' ')}
              >
                <Icon
                  className={[
                    'h-4 w-4 shrink-0 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                  ].join(' ')}
                />
                <span className="truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-auto px-2 py-3">
        <SidebarFooter />
      </div>
    </nav>
  );
}

function SidebarFooter() {
  // We'll wire the quota indicator lazily — keeps this component standalone
  return (
    <div className="rounded-md border border-sidebar-border bg-surface-muted px-3 py-2.5 text-[11px] text-muted-foreground">
      <div className="font-medium text-foreground">AIDIP {AIDIP_VERSION}</div>
      <div className="mt-0.5">© 2026 HESYD · Microsoft Fabric native</div>
    </div>
  );
}

const AIDIP_VERSION = 'v3.0 MVP';

function isActive(currentPath: string, linkTo: string): boolean {
  if (linkTo === '/dashboard' && currentPath === '/dashboard') return true;
  // For routes with sub-paths, highlight when current path starts with link
  // (e.g. /admin/team matches /admin/team and /admin/team/123)
  if (linkTo !== '/dashboard') {
    return currentPath === linkTo || currentPath.startsWith(linkTo + '/');
  }
  return false;
}
