/**
 * AIDIP — Impersonate Modal (Super Admin) — CDC §5 / Module 2.
 *
 * Used to start an impersonation session on a client user. Enforces the
 * mandatory justification rule (min 10 chars, CDC §5 Rule 3) and the
 * 30-minute max-duration auto-logout at the session layer.
 *
 * After a successful start, the page is force-reloaded so the AppShell
 * mounts the ImpersonateBanner and the target user's data surfaces
 * across the entire UI.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, UserSearch } from 'lucide-react';

import type { User } from '@/lib/aidip/types';
import { IMPERSONATE_MAX_DURATION_MINUTES } from '@/lib/aidip/constants';
import { ServiceContainer } from '@/services/ServiceContainer';
import { getInitials } from '@/lib/aidip/format';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABEL } from '@/lib/aidip/types';
// ROLE_LABEL is re-exported from types.ts (single source of truth).

interface ImpersonateModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When provided, the modal operates in "fixed target" mode. */
  targetUserId?: string;
  targetUserName?: string;
}

const MIN_JUSTIFICATION_LENGTH = 10;

export function ImpersonateModal({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
}: ImpersonateModalProps) {
  const isFixedTarget = !!targetUserId;

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load company members when no fixed target is provided
  useEffect(() => {
    if (!open || isFixedTarget) return;
    let cancelled = false;
    setUsersLoading(true);
    ServiceContainer.getInstance()
      .aidip.user.listByCompany({ search: search || undefined })
      .then((items) => {
        if (cancelled) return;
        // Exclude deleted users from impersonation candidates
        setUsers(items.filter((u) => u.status !== 'deleted'));
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isFixedTarget, search]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedUser(null);
      setReason('');
      setError(null);
    }
  }, [open]);

  const effectiveUserId = targetUserId ?? selectedUser?.id ?? null;

  const justificationValid = reason.trim().length >= MIN_JUSTIFICATION_LENGTH;
  const canSubmit = !!effectiveUserId && justificationValid && !submitting;

  const filteredUsers = useMemo(() => {
    if (isFixedTarget) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search, isFixedTarget]);

  const handleSubmit = async () => {
    if (!effectiveUserId) return;
    setSubmitting(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.impersonation;
      const result = await svc.start(effectiveUserId, reason.trim());
      if (!result.ok) {
        setError(result.message ?? 'Failed to start impersonation.');
        setSubmitting(false);
        return;
      }
      onOpenChange(false);
      // Force a full reload so the AppShell picks up the impersonated session
      // and displays the red banner + the target user's UI.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start impersonation.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Impersonate user
          </DialogTitle>
          <DialogDescription>
            Temporarily sign in as a client user to investigate or support them. All actions
            performed during impersonation are logged against your Super Admin account.
          </DialogDescription>
        </DialogHeader>

        {/* Warning banner */}
        <div className="flex gap-3 rounded-md border border-warning/30 bg-warning-subtle px-3.5 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Audited action</span>
            <span>
              All actions performed during impersonation are logged. Maximum duration:{' '}
              {IMPERSONATE_MAX_DURATION_MINUTES} minutes. Auto-logout at expiry.
            </span>
          </div>
        </div>

        {/* Target user — fixed or selectable */}
        {isFixedTarget ? (
          <div className="flex flex-col gap-2">
            <Label>You will impersonate</Label>
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary-subtle text-xs font-medium text-primary">
                  {getInitials(targetUserName ?? '?')}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{targetUserName}</span>
                <span className="text-xs text-muted-foreground">Target user (pre-selected)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="impersonate-search">Search user</Label>
            <div className="relative">
              <UserSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="impersonate-search"
                placeholder="Search by name or email…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-border">
              {usersLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading members…
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No users match your search.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredUsers.slice(0, 25).map((u) => {
                    const selected = selectedUser?.id === u.id;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedUser(u)}
                          className={[
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60',
                            selected ? 'bg-primary-subtle' : '',
                          ].join(' ')}
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
                              {getInitials(u.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {u.fullName}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {ROLE_LABEL[u.role]}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Justification */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="impersonate-reason">
            Justification (required, will be logged)
          </Label>
          <Textarea
            id="impersonate-reason"
            placeholder="Explain why this impersonation is necessary — e.g. 'Investigating ticket #1234: user reports schema extraction failure.'"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="resize-none"
            aria-invalid={!justificationValid && reason.length > 0}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Minimum {MIN_JUSTIFICATION_LENGTH} characters. This text is permanently stored in the
              audit log.
            </span>
            <span
              className={
                justificationValid ? 'text-success' : reason.length > 0 ? 'text-destructive' : ''
              }
            >
              {reason.trim().length}/{MIN_JUSTIFICATION_LENGTH}+
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" />
                Start impersonation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
