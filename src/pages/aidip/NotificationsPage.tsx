/**
 * AIDIP Notifications page — Module 8 (CDC §12).
 *
 * Full notification history with type/status filters, search, tabs,
 * pagination (20 per page), and per-item mark-as-read / archive actions.
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Archive,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  MailOpen,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Notification, NotificationStatus, NotificationType } from '@/lib/aidip/types';
import {
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_TYPE_LABEL,
} from '@/lib/aidip/constants';
import { formatRelativeTime } from '@/lib/aidip/format';
import { ServiceContainer } from '@/services/ServiceContainer';
import { cn } from '@/lib/utils';

import {
  PageContainer,
  PageHeader,
  EmptyState,
} from '@/components/aidip/PagePrimitives';
import { NotificationIcon } from '@/components/aidip/NotificationIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'unread' | 'read';
type TypeFilter = 'all' | NotificationType;

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.notification;
      const list = await svc.list({
        status: statusFilter === 'all' ? undefined : (statusFilter as NotificationStatus),
        type: typeFilter === 'all' ? undefined : (typeFilter as NotificationType),
      });
      setNotifications(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notifications;
    const q = search.trim().toLowerCase();
    return notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        NOTIFICATION_TYPE_LABEL[n.type].toLowerCase().includes(q),
    );
  }, [notifications, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  const handleMarkAllAsRead = async () => {
    try {
      await ServiceContainer.getInstance().aidip.notification.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) =>
          n.status === 'unread'
            ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
            : n,
        ),
      );
      toast.success('All notifications marked as read.');
    } catch {
      toast.error('Could not mark all as read.');
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await ServiceContainer.getInstance().aidip.notification.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
            : n,
        ),
      );
    } catch {
      toast.error('Could not mark notification as read.');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await ServiceContainer.getInstance().aidip.notification.archive(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification archived.');
    } catch {
      toast.error('Could not archive notification.');
    }
  };

  // Tabs value mirrors status filter (only All / Unread tabs).
  // If status is 'read' (selected via dropdown), neither tab is active.
  const tabsValue = statusFilter === 'read' ? '' : statusFilter;

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        subtitle="Stay on top of report shares, exports, and platform updates."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleMarkAllAsRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Link to="/profile">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </>
        }
      />

      {/* Filters bar */}
      <Card className="mb-4 gap-0 py-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="pl-8"
              aria-label="Search notifications"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              Type
            </span>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as TypeFilter)}
            >
              <SelectTrigger size="sm" className="w-[180px]" aria-label="Filter by type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <Separator className="my-1" />
                {NOTIFICATION_TYPE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {NOTIFICATION_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              Status
            </span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger size="sm" className="w-[140px]" aria-label="Filter by status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabs: All / Unread */}
      <Tabs
        value={tabsValue}
        onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
        className="mb-3"
      >
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            All
            {notifications.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {notifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread" className="gap-1.5">
            Unread
            {unreadCount > 0 && (
              <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Notifications list */}
      <Card className="gap-0 py-0">
        {loading ? (
          <NotificationsSkeleton />
        ) : error ? (
          <EmptyState
            icon={Bell}
            title="Couldn't load notifications"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="No notifications match your current filters. New activity will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pageItems.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onMarkAsRead={handleMarkAsRead}
                onArchive={handleArchive}
              />
            ))}
          </ul>
        )}

        {/* Pagination footer */}
        {!loading && !error && filtered.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{currentPage}</span> of{' '}
                <span className="font-medium text-foreground">{totalPages}</span>
                <span className="ml-2 hidden sm:inline">
                  · {filtered.length} notification{filtered.length === 1 ? '' : 's'}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Footer note */}
      <p className="mt-4 text-xs text-muted-foreground">
        Notifications are retained for 90 days. Archived items are auto-deleted after 30 days.
      </p>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function NotificationRow({
  notification: n,
  onMarkAsRead,
  onArchive,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const isUnread = n.status === 'unread';

  return (
    <li
      className={cn(
        'group relative transition-colors',
        isUnread
          ? 'border-l-2 border-l-primary bg-primary-subtle/50 hover:bg-primary-subtle/70'
          : 'hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        {/* Type icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            isUnread
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <NotificationIcon type={n.type} className="h-4 w-4" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm leading-tight text-foreground',
                  isUnread ? 'font-semibold' : 'font-medium',
                )}
              >
                {n.title}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {n.message}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatRelativeTime(n.createdAt)}
            </span>
          </div>

          {/* Meta row: type label + action */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {NOTIFICATION_TYPE_LABEL[n.type]}
            </span>
            {n.actionUrl && n.actionLabel && (
              <Button
                asChild
                variant="link"
                size="sm"
                className="h-auto gap-1 p-0 text-xs font-medium text-primary"
              >
                <Link to={n.actionUrl} onClick={() => isUnread && onMarkAsRead(n.id)}>
                  {n.actionLabel}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Per-item actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {isUnread && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => void onMarkAsRead(n.id)}
                  aria-label="Mark as read"
                >
                  <MailOpen className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as read</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => void onArchive(n.id)}
                aria-label="Archive notification"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

function NotificationsSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
