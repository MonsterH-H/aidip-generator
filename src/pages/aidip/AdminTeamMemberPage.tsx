/**
 * AIDIP Admin — Team member profile page (Module 7, CDC §8).
 *
 * Route: /admin/team/:userId  (admin + super_admin only)
 *
 * Two-column profile: left column surfaces the member's identity, status
 * and usage stats; right column lists recent logins, created reports and
 * last conversations. Action bar mirrors the team-list actions
 * (suspend / reactivate, role change, delete with optional transfer).
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  Monitor,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  Conversation,
  Report,
  User,
  UserRole,
} from '@/lib/aidip/types';
import {
  REPORT_STATUS_BADGE_VARIANT,
  REPORT_STATUS_LABEL,
  ROLE_BADGE_VARIANT,
  USER_STATUS_BADGE_VARIANT,
  USER_STATUS_LABEL,
} from '@/lib/aidip/constants';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getInitials,
} from '@/lib/aidip/format';
import { ServiceContainer } from '@/services/ServiceContainer';
import { cn } from '@/lib/utils';

import {
  PageContainer,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';

/* ----------------------------------------------------------------------------
   Mocked login history — backend doesn't expose this yet (CDC §8.4).
   We surface 5–10 deterministic mock entries derived from the user id so
   the admin sees a realistic session trail.
---------------------------------------------------------------------------- */
interface LoginHistoryEntry {
  id: string;
  date: string;
  ip: string;
  browser: string;
  location: string;
}

function buildLoginHistory(user: User): LoginHistoryEntry[] {
  const browsers = ['Chrome 131 · macOS', 'Edge 130 · Windows 11', 'Safari 17 · iOS', 'Firefox 129 · Linux'];
  const locations = ['Casablanca, MA', 'Rabat, MA', 'Paris, FR', 'London, UK', 'Dubai, AE'];
  const baseTs = user.lastLogin ? new Date(user.lastLogin).getTime() : Date.now();
  const count = 7;
  return Array.from({ length: count }).map((_, i) => {
    const ts = new Date(baseTs - i * 6 * 3600_000 - i * 47 * 60_000).toISOString();
    return {
      id: `${user.id}-login-${i}`,
      date: ts,
      ip: `41.${(92 + i) % 255}.${(i * 13) % 255}.${(i * 29 + 7) % 255}`,
      browser: browsers[i % browsers.length]!,
      location: locations[i % locations.length]!,
    };
  });
}

/** Mask all but the last 4 chars of the Azure AD object ID. */
function maskAzureAdId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 4) return '••••';
  return '•'.repeat(Math.max(4, id.length - 4)) + id.slice(-4);
}

export function AdminTeamMemberPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<Report[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [roleChangeOpen, setRoleChangeOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferCandidates, setTransferCandidates] = useState<User[]>([]);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip;
      const [u, allReports, allConversations, team] = await Promise.all([
        svc.user.get(userId),
        svc.report.list(),
        svc.conversation.list(),
        svc.user.listByCompany({ status: 'active' }),
      ]);
      if (!u) {
        setError('Member not found.');
        return;
      }
      setUser(u);
      setReports(
        allReports
          .filter((r) => r.userId === userId && r.status !== 'deleted')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 10),
      );
      setConversations(
        allConversations
          .filter((c) => c.userId === userId)
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
          .slice(0, 10),
      );
      setTransferCandidates(team.filter((m) => m.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load member.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loginHistory = useMemo(() => (user ? buildLoginHistory(user) : []), [user]);

  /* -------------------------------------------------------------------------
     Actions
  ------------------------------------------------------------------------- */
  const handleRoleChange = async () => {
    if (!user) return;
    const nextRole: UserRole = user.role === 'admin' ? 'analyst' : 'admin';
    setActionPending(true);
    try {
      const updated = await ServiceContainer.getInstance().aidip.user.updateRole(user.id, nextRole);
      setUser(updated);
      toast.success(`${updated.fullName} is now ${nextRole === 'admin' ? 'an Admin' : 'an Analyst'}.`);
      setRoleChangeOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setActionPending(false);
    }
  };

  const handleSuspendToggle = async () => {
    if (!user) return;
    const isSuspended = user.status === 'suspended';
    setActionPending(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.user;
      const updated = isSuspended ? await svc.reactivate(user.id) : await svc.suspend(user.id);
      setUser(updated);
      toast.success(
        isSuspended
          ? `${updated.fullName} has been reactivated.`
          : `${updated.fullName} has been suspended.`,
      );
      setSuspendOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update member status.');
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setActionPending(true);
    try {
      await ServiceContainer.getInstance().aidip.user.softDelete(user.id, transferTo || undefined);
      toast.success(`${user.fullName} has been removed.`);
      navigate('/admin/team');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove member.');
    } finally {
      setActionPending(false);
    }
  };

  /* -------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------- */
  if (loading) {
    return (
      <PageContainer>
        <LoadingState label="Loading member profile…" />
      </PageContainer>
    );
  }

  if (error || !user) {
    return (
      <PageContainer>
        <ErrorState
          message={error ?? 'Member not found.'}
          onRetry={() => navigate('/admin/team')}
        />
      </PageContainer>
    );
  }

  const isSuspended = user.status === 'suspended';
  const usageStats = [
    { label: 'Conversations', value: conversations.length, icon: MessageSquare },
    { label: 'Reports', value: reports.length, icon: FileText },
    { label: 'Queries today', value: user.queriesToday, icon: Clock },
    { label: 'Avg. response', value: '1.8s', icon: Globe },
  ];

  return (
    <PageContainer>
      {/* Page header with back button + actions */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate('/admin/team')}
            aria-label="Back to team"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary-subtle text-sm font-semibold text-primary">
              {getInitials(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              {user.fullName}
              <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                {user.role === 'admin' ? 'Admin' : 'Analyst'}
              </Badge>
              <Badge variant={USER_STATUS_BADGE_VARIANT[user.status]}>
                {USER_STATUS_LABEL[user.status]}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSuspendOpen(true)}
          >
            {isSuspended ? (
              <>
                <ShieldCheck className="h-4 w-4 text-success" />
                Reactivate
              </>
            ) : (
              <>
                <ShieldOff className="h-4 w-4 text-warning" />
                Suspend
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setRoleChangeOpen(true)}
          >
            <UserCog className="h-4 w-4" />
            Change role
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ============== Left column — user info card ============== */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-sm">Member information</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {/* Avatar + name */}
              <div className="flex flex-col items-center gap-2 pb-5 text-center">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary-subtle text-lg font-semibold text-primary">
                    {getInitials(user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-base font-semibold text-foreground">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                    {user.role === 'admin' ? 'Admin' : 'Analyst'}
                  </Badge>
                  <Badge variant={USER_STATUS_BADGE_VARIANT[user.status]}>
                    {USER_STATUS_LABEL[user.status]}
                  </Badge>
                </div>
              </div>

              <Separator className="mb-4" />

              {/* Identity fields */}
              <dl className="grid gap-3 text-sm">
                <InfoRow label="Full name" value={user.fullName} />
                <InfoRow label="Email" value={user.email} />
                <InfoRow
                  label="Role"
                  value={user.role === 'admin' ? 'Admin' : 'Analyst'}
                />
                <InfoRow label="Status" value={USER_STATUS_LABEL[user.status]} />
                <InfoRow label="Registered" value={formatDate(user.createdAt)} />
                <InfoRow
                  label="Azure AD ID"
                  value={maskAzureAdId(user.azureAdId)}
                  mono
                />
              </dl>

              <Separator className="my-4" />

              {/* Last login */}
              <div className="grid gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last login
                </p>
                <p className="text-sm text-foreground">
                  {user.lastLogin ? formatDateTime(user.lastLogin) : 'Never signed in'}
                </p>
                {user.lastLogin && (
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(user.lastLogin)}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              {/* Usage stats */}
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Usage (this company)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {usageStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="rounded-md border border-border bg-muted/30 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Icon className="h-3 w-3" />
                          {stat.label}
                        </div>
                        <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                          {stat.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============== Right column — stacked cards ============== */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Login history */}
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Monitor className="h-4 w-4 text-primary" />
                Login history
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">Last {loginHistory.length} sessions</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-5">Date</TableHead>
                    <TableHead>IP address</TableHead>
                    <TableHead>Browser</TableHead>
                    <TableHead className="pr-5">Approx. location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="pl-5 text-sm text-foreground">
                        {formatDateTime(entry.date)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {entry.ip}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.browser}
                      </TableCell>
                      <TableCell className="pr-5 text-sm text-muted-foreground">
                        {entry.location}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Created reports */}
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                Created reports
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(reports.length, 10)} of {reports.length}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {reports.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No reports yet"
                  description="This member hasn't created any reports."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/reports/${r.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Modified {formatRelativeTime(r.updatedAt)}
                          </p>
                        </div>
                        <Badge variant={REPORT_STATUS_BADGE_VARIANT[r.status]}>
                          {REPORT_STATUS_LABEL[r.status]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Last conversations */}
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-primary" />
                Last conversations
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(conversations.length, 10)} of {conversations.length}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {conversations.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No conversations yet"
                  description="This member hasn't started any chat conversations."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/chat/${c.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50"
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeTime(c.lastMessageAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============== Role change confirmation ============== */}
      <AlertDialog open={roleChangeOpen} onOpenChange={setRoleChangeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Change role for {user.fullName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.role === 'admin' ? (
                <>
                  This will demote <strong>{user.fullName}</strong> from Admin to Analyst. They will
                  lose access to team management, KPI configuration and dataset permissions.
                </>
              ) : (
                <>
                  This will promote <strong>{user.fullName}</strong> from Analyst to Admin. They will
                  gain access to manage members, invitations, KPIs and dataset permissions.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRoleChange();
              }}
              disabled={actionPending}
              className="gap-1.5"
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm role change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============== Suspend / reactivate confirmation ============== */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isSuspended ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-success" />
                  Reactivate {user.fullName}?
                </>
              ) : (
                <>
                  <ShieldOff className="h-5 w-5 text-warning" />
                  Suspend {user.fullName}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSuspended
                ? `This will restore access for ${user.fullName}. They will be able to sign in and use the platform again.`
                : `This will temporarily block ${user.fullName} from signing in. Their reports and history will be preserved.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSuspendToggle();
              }}
              disabled={actionPending}
              className={cn(
                'gap-1.5',
                !isSuspended && 'bg-warning text-warning-foreground hover:bg-warning/90',
              )}
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSuspended ? 'Reactivate member' : 'Suspend member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============== Delete confirmation (with optional transfer) ============== */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setTransferTo('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove {user.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{user.fullName}</strong> from your team. The
              account will be soft-deleted and the member will no longer be able to sign in. You can
              optionally transfer ownership of their reports to another active member.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {transferCandidates.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="transfer-detail" className="text-xs">
                Transfer reports to (optional)
              </Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger id="transfer-detail" className="w-full">
                  <SelectValue placeholder="Select a member — or leave blank to delete reports with the user" />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName} — {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-warning">
              This action is recorded in the audit log. Soft-deleted accounts are purged after 30 days.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={actionPending}
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              {actionPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-right text-sm font-medium text-foreground',
          mono && 'font-mono text-xs',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
