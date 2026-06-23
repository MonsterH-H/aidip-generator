/**
 * Notifications panel — right-side slide-out triggered by the bell icon.
 *
 * Lists recent notifications, supports mark-as-read / mark-all / archive,
 * and links to the full /notifications history page.
 */

import { Link } from 'react-router-dom';
import { CheckCheck, Settings2, Archive, BellOff } from 'lucide-react';

import type { Notification } from '@/lib/aidip/types';
import { NOTIFICATION_TYPE_LABEL } from '@/lib/aidip/constants';
import { formatRelativeTime } from '@/lib/aidip/format';
import { useNotifications } from '@/hooks/aidip/useNotifications';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotificationIcon } from './NotificationIcon';

interface NotificationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}

export function NotificationsPanel({ open, onOpenChange, trigger }: NotificationsPanelProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, archive } = useNotifications();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {unreadCount} new
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => void markAllAsRead()}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>

        <ScrollArea className="h-[360px]">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">No new notifications right now.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {notifications.slice(0, 30).map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={() => void markAsRead(n.id)}
                  onArchive={() => void archive(n.id)}
                />
              ))}
            </ul>
          )}
        </ScrollArea>

        <Separator />
        <div className="flex items-center justify-between px-4 py-2.5">
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
            <Link to="/notifications">
              View all notifications
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
            <Link to="/profile">
              <Settings2 className="h-3.5 w-3.5" /> Settings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  notification: n,
  onRead,
  onArchive,
}: {
  notification: Notification;
  onRead: () => void;
  onArchive: () => void;
}) {
  const isUnread = n.status === 'unread';
  return (
    <li
      className={[
        'group relative border-b border-border last:border-0',
        isUnread ? 'bg-primary-subtle/40' : 'hover:bg-muted/50',
      ].join(' ')}
    >
      {isUnread && (
        <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      )}
      <div className={['flex items-start gap-3 px-4 py-3', isUnread ? 'pl-5' : ''].join(' ')}>
        <NotificationIcon type={n.type} className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight text-foreground">{n.title}</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatRelativeTime(n.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {NOTIFICATION_TYPE_LABEL[n.type]}
            </span>
            {n.actionUrl && n.actionLabel && (
              <Link
                to={n.actionUrl}
                onClick={onRead}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {n.actionLabel}
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onArchive}
          className="invisible rounded p-1 text-muted-foreground hover:bg-muted group-hover:visible"
          aria-label="Archive notification"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
