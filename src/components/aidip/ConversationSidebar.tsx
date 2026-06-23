/**
 * AIDIP — Conversation sidebar (CDC §6.2).
 *
 * Left-hand rail shown on both `/chat` (welcome) and `/chat/:conversationId`.
 * Surfaces the user's conversations with search, inline rename, archive, and
 * soft-delete (with confirmation), plus a daily-quota indicator in the footer.
 *
 * Conversation isolation (CDC §6 Rule 4): the underlying service only returns
 * conversations owned by the current user — this component simply renders
 * whatever the service returns.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Conversation } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { formatRelativeTime, quotaWarningLevel } from '@/lib/aidip/format';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ConversationSidebarProps {
  /** Currently-open conversation id (highlighted in the list). */
  activeId?: string;
  /** Increment to force a refresh of the conversation list + quota. */
  refreshKey?: number;
}

export function ConversationSidebar({ activeId, refreshKey = 0 }: ConversationSidebarProps) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const svc = ServiceContainer.getInstance().aidip;
      const [convs, dash] = await Promise.all([
        svc.conversation.list(),
        svc.analytics.getDashboardData(),
      ]);
      setConversations(convs);
      setQuota({ used: dash.quota.used, total: dash.quota.total });
    } catch (err) {
      console.error('Failed to load conversations sidebar', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = search.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()))
    : conversations;

  function handleRenameStart(c: Conversation) {
    setEditingId(c.id);
    setEditingTitle(c.title);
  }

  async function handleRenameSave(id: string) {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await ServiceContainer.getInstance().aidip.conversation.rename(id, title);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      toast.success('Conversation renamed');
    } catch (err) {
      toast.error('Failed to rename conversation');
      console.error(err);
    }
  }

  async function handleArchive(id: string) {
    setActionBusy(true);
    try {
      await ServiceContainer.getInstance().aidip.conversation.archive(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast.success('Conversation archived');
      if (id === activeId) navigate('/chat');
    } catch (err) {
      toast.error('Failed to archive conversation');
      console.error(err);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await ServiceContainer.getInstance().aidip.conversation.softDelete(deleteTarget.id);
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success('Conversation deleted');
      if (deleteTarget.id === activeId) navigate('/chat');
    } catch (err) {
      toast.error('Failed to delete conversation');
      console.error(err);
    } finally {
      setActionBusy(false);
      setDeleteTarget(null);
    }
  }

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </span>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link to="/chat?new=true" aria-label="Start a new chat">
            <Plus className="h-3.5 w-3.5" /> New
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="h-8 pl-8 pr-7 text-xs"
            aria-label="Search conversations"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <ul className="flex flex-col gap-1 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-14 w-full rounded-md" />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-muted-foreground">
            {search
              ? 'No conversations match your search.'
              : 'No conversations yet. Start a new chat to begin.'}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                editing={editingId === c.id}
                editingTitle={editingTitle}
                onStartEdit={() => handleRenameStart(c)}
                onCancelEdit={() => setEditingId(null)}
                onChangeEditingTitle={setEditingTitle}
                onSaveEdit={() => void handleRenameSave(c.id)}
                onArchive={() => void handleArchive(c.id)}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Quota footer */}
      <div className="border-t border-sidebar-border px-3 py-2.5">
        {quota ? <QuotaIndicator used={quota.used} total={quota.total} /> : <Skeleton className="h-6 w-full" />}
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be moved to trash and recoverable for 30 days.
              After that, it will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={actionBusy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

interface ConversationRowProps {
  conv: Conversation;
  active: boolean;
  editing: boolean;
  editingTitle: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEditingTitle: (v: string) => void;
  onSaveEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function ConversationRow({
  conv,
  active,
  editing,
  editingTitle,
  onStartEdit,
  onCancelEdit,
  onChangeEditingTitle,
  onSaveEdit,
  onArchive,
  onDelete,
}: ConversationRowProps) {
  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  }

  return (
    <li>
      <div
        className={cn(
          'group relative rounded-md border border-transparent transition-colors',
          active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/60',
        )}
      >
        {editing ? (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Input
              autoFocus
              value={editingTitle}
              onChange={(e) => onChangeEditingTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="h-7 flex-1 text-xs"
              aria-label="Conversation title"
            />
            <button
              type="button"
              onClick={onSaveEdit}
              className="rounded p-1 text-success hover:bg-success-subtle"
              aria-label="Save name"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Cancel rename"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <Link
              to={`/chat/${conv.id}`}
              className="flex flex-col gap-0.5 px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    active ? 'bg-primary' : 'bg-transparent',
                  )}
                />
                <span
                  className={cn(
                    'truncate text-xs font-medium',
                    active ? 'text-sidebar-accent-foreground' : 'text-foreground',
                  )}
                >
                  {conv.title}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pl-3 text-[10px] text-muted-foreground">
                <span>{formatRelativeTime(conv.lastMessageAt)}</span>
                <span aria-hidden>·</span>
                <span>{conv.messageCount} {conv.messageCount === 1 ? 'msg' : 'msgs'}</span>
              </div>
            </Link>

            <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:bg-background/80"
                    aria-label="Conversation actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onSelect={onStartEdit} className="gap-2 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onArchive} className="gap-2 text-xs">
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function QuotaIndicator({ used, total }: { used: number; total: number }) {
  const level = quotaWarningLevel(used, total);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor = level === 'critical' ? 'bg-destructive' : level === 'warning' ? 'bg-warning' : 'bg-primary';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Queries today</span>
        <span
          className={cn(
            'font-medium tabular-nums',
            level === 'critical' ? 'text-destructive' : level === 'warning' ? 'text-warning' : 'text-foreground',
          )}
        >
          {used} / {total}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
