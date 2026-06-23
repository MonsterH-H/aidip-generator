/**
 * AIDIP — App Shell layout.
 *
 * Premium enterprise shell inspired by Azure Portal / Microsoft Fabric /
 * Vercel Dashboard / Stripe Dashboard.
 *
 * Structure:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (56px) — logo · company badge · search · bell · avatar │
 *   ├────────────┬─────────────────────────────────────────────────┤
 *   │ Sidebar    │ Content                                         │
 *   │ (256px)    │ (flex)                                          │
 *   │            │                                                 │
 *   └────────────┴─────────────────────────────────────────────────┘
 *
 * Responsive:
 *   - Desktop (≥1024px): sidebar pinned
 *   - Tablet/mobile (<1024px): sidebar via drawer (Sheet)
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  User as UserIcon,
  X,
} from 'lucide-react';

import { AIDIP_BRAND } from '@/lib/aidip/constants';
import { getInitials } from '@/lib/aidip/format';
import { useAuth } from '@/hooks/AuthContext';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { useNotifications } from '@/hooks/aidip/useNotifications';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { GlobalSearchModal } from '@/components/aidip/GlobalSearchModal';
import { NotificationsPanel } from '@/components/aidip/NotificationsPanel';
import { ImpersonateBanner } from '@/components/aidip/ImpersonateBanner';
import { SidebarNav, type SidebarNavItem, type SidebarNavGroup } from '@/components/layout/SidebarNav';

interface AppShellProps {
  children: React.ReactNode;
  navItems: SidebarNavItem[] | SidebarNavGroup[];
  /** Optional badge shown next to the company name in the header. */
  headerBadge?: string;
}

export function AppShell({ children, navItems, headerBadge }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { user, role, impersonation } = useAidipSession();
  const { unreadCount } = useNotifications();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Cmd+K / Ctrl+K opens global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ============================ Header ============================ */}
      <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-3 border-b border-header-border bg-header px-4 backdrop-blur md:px-6">
        {/* Mobile nav trigger */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] border-r border-sidebar-border bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-[var(--header-height)] items-center gap-2 border-b border-sidebar-border px-4">
              <AidipLogo />
              <span className="font-semibold tracking-tight">{AIDIP_BRAND.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto lg:hidden"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav items={navItems} />
          </SheetContent>
        </Sheet>

        {/* Logo + brand */}
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <AidipLogo />
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {AIDIP_BRAND.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {AIDIP_BRAND.tagline}
            </span>
          </div>
        </Link>

        {/* Company badge (analyst/admin only) */}
        {role && role !== 'super_admin' && user?.companyId && (
          <Badge
            variant="outline"
            className="ml-2 hidden border-primary/30 bg-primary-subtle px-2 py-0.5 text-[11px] font-medium text-primary-subtle-foreground md:inline-flex"
          >
            {headerBadge ?? 'Company workspace'}
          </Badge>
        )}
        {role === 'admin' && (
          <Badge className="hidden bg-warning-subtle text-warning md:inline-flex" variant="outline">
            Admin
          </Badge>
        )}
        {role === 'super_admin' && (
          <Badge className="hidden bg-destructive-subtle text-destructive md:inline-flex" variant="outline">
            Super Admin
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Global search trigger */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden h-9 gap-2 px-3 text-muted-foreground sm:flex"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="h-4 w-4" />
                  <span className="text-sm">Search…</span>
                  <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    ⌘K
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search conversations, reports, exports (⌘K)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications bell */}
          <NotificationsPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </Button>
            }
          />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 gap-2 px-1.5 sm:px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground">
                    {getInitials(user?.fullName ?? 'U')}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">
                  {user?.fullName?.split(' ')[0] ?? 'Account'}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{user?.fullName ?? 'User'}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
                  {role && (
                    <span className="mt-1 inline-flex w-fit items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin Entreprise' : 'Analyste'}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/notifications" className="flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Notifications
                </Link>
              </DropdownMenuItem>
              {role === 'admin' && (
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" /> Company settings
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ========================= Impersonate banner =================== */}
      {impersonation && <ImpersonateBanner session={impersonation} />}

      {/* ============================ Body ============================= */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <SidebarNav items={navItems} />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full">{children}</div>
        </main>
      </div>

      {/* Global search modal (Cmd+K) */}
      <GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Subtle bottom separator */}
      <Separator className="hidden" />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function AidipLogo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
      <svg viewBox="0 0 32 32" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M9 22V10h4.5c2.8 0 4.6 1.6 4.6 4.2 0 2.7-1.9 4.3-4.7 4.3h-2.1V22H9zm2.3-5.8h2c1.5 0 2.4-.8 2.4-2 0-1.3-.9-2-2.4-2h-2v4z" />
        <circle cx="22" cy="11" r="2" />
        <path d="M20 22v-7h4v7h-4z" />
      </svg>
    </div>
  );
}
