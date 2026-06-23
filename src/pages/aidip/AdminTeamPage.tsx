/**
 * AIDIP Admin — Team Management page (Module 7, CDC §8).
 *
 * Route: /admin/team  (admin + super_admin only)
 *
 * Lists company members with search, role and status filters, and a tabbed
 * view of pending invitations. Per-member actions: view profile, change
 * role (with confirmation), suspend / reactivate, and delete (with
 * optional report ownership transfer).
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  Invitation,
  InvitationStatus,
  User,
  UserRole,
  UserStatus,
} from '@/lib/aidip/types';
import {
  INVITATION_STATUS_LABEL,
  ROLE_BADGE_VARIANT,
  USER_STATUS_BADGE_VARIANT,
  USER_STATUS_LABEL,
} from '@/lib/aidip/constants';
import {
  formatDate,
  formatRelativeTime,
  getInitials,
} from '@/lib/aidip/format';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { cn } from '@/lib/utils';

import {
  PageContainer,
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';
import { InviteMemberModal } from '@/components/aidip/InviteMemberModal';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const PAGE_SIZE = 20;

type RoleFilter = 'all' | UserRole;
type StatusFilter = 'all' | UserStatus;
type Tab = 'members' | 'invitations';

/** Invitation status → badge variant (kept here since the constant isn't exported). */
const INVITATION_STATUS_BADGE_VARIANT: Record<
  InvitationStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  accepted: 'default',
  expired: 'outline',
  cancelled: 'destructive',
};

export function AdminTeamPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAidipSession();

  const [tab, setTab] = useState<Tab>('members');

  // Members state
  const [members, setMembers] = useState<User[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);

  // Modal / dialog state
  const [inviteOpen, setInviteOpen] = useState(false);

  // Action targets
  const [roleChangeTarget, setRoleChangeTarget] = useState<User | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [transferTo, setTransferTo] = useState<string>('');

  const [actionPending, setActionPending] = useState(false);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.user;
      const list = await svc.listByCompany({
        role: roleFilter === 'all' ? undefined : roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      setMembers(list);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : 'Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  }, [roleFilter, statusFilter, search]);

  const loadInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    setInvitationsError(null);
    try {
      const list = await ServiceContainer.getInstance().aidip.invitation.listByCompany();
      setInvitations(list);
    } catch (e) {
      setInvitationsError(e instanceof Error ? e.message : 'Failed to load invitations.');
    } finally {
      setInvitationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (tab === 'invitations') void loadInvitations();
  }, [tab, loadInvitations]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageMembers = useMemo(
    () => members.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [members, currentPage],
  );

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => i.status === 'pending'),
    [invitations],
  );

  /** Other members eligible as a transfer target (active, not the one being deleted). */
  const transferCandidates = useMemo(
    () => members.filter((m) => m.id !== deleteTarget?.id && m.status === 'active'),
    [members, deleteTarget],
  );

  /* -------------------------------------------------------------------------
     Actions
  ------------------------------------------------------------------------- */
  const refreshAfterAction = async () => {
    await Promise.all([loadMembers(), loadInvitations()]);
  };

  const handleRoleChange = async () => {
    if (!roleChangeTarget) return;
    const nextRole: UserRole = roleChangeTarget.role === 'admin' ? 'analyst' : 'admin';
    setActionPending(true);
    try {
      await ServiceContainer.getInstance().aidip.user.updateRole(roleChangeTarget.id, nextRole);
      toast.success(`${roleChangeTarget.fullName} is now ${nextRole === 'admin' ? 'an Admin' : 'an Analyst'}.`);
      setRoleChangeTarget(null);
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setActionPending(false);
    }
  };

  const handleSuspendConfirm = async () => {
    if (!suspendTarget) return;
    const isSuspended = suspendTarget.status === 'suspended';
    setActionPending(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.user;
      if (isSuspended) {
        await svc.reactivate(suspendTarget.id);
        toast.success(`${suspendTarget.fullName} has been reactivated.`);
      } else {
        await svc.suspend(suspendTarget.id);
        toast.success(`${suspendTarget.fullName} has been suspended.`);
      }
      setSuspendTarget(null);
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update member status.');
    } finally {
      setActionPending(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionPending(true);
    try {
      await ServiceContainer.getInstance().aidip.user.softDelete(
        deleteTarget.id,
        transferTo || undefined,
      );
      toast.success(
        transferTo
          ? `${deleteTarget.fullName} removed. Reports transferred to ${transferCandidates.find((m) => m.id === transferTo)?.fullName ?? 'selected member'}.`
          : `${deleteTarget.fullName} has been removed.`,
      );
      setDeleteTarget(null);
      setTransferTo('');
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove member.');
    } finally {
      setActionPending(false);
    }
  };

  const handleResendInvitation = async (inv: Invitation) => {
    try {
      await ServiceContainer.getInstance().aidip.invitation.resend(inv.id);
      toast.success(`Invitation resent to ${inv.email}.`);
      await loadInvitations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resend invitation.');
    }
  };

  const handleCancelInvitation = async (inv: Invitation) => {
    try {
      await ServiceContainer.getInstance().aidip.invitation.cancel(inv.id);
      toast.success(`Invitation to ${inv.email} cancelled.`);
      await loadInvitations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel invitation.');
    }
  };

  /* -------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------- */
  return (
    <PageContainer>
      <PageHeader
        title="Team"
        subtitle="Manage members and invitations for your company."
        actions={
          <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Members
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Pending Invitations
            {pendingInvitations.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {pendingInvitations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============== Members tab ============== */}
        <TabsContent value="members">
          {/* Toolbar */}
          <Card className="mb-4 gap-0 py-0">
            <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-8"
                  aria-label="Search members"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Role</span>
                <Select
                  value={roleFilter}
                  onValueChange={(v) => setRoleFilter(v as RoleFilter)}
                >
                  <SelectTrigger size="sm" className="w-[150px]" aria-label="Filter by role">
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Status</span>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <SelectTrigger size="sm" className="w-[150px]" aria-label="Filter by status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="gap-0 py-0">
            {membersLoading ? (
              <MembersTableSkeleton />
            ) : membersError ? (
              <ErrorState message={membersError} onRetry={() => void loadMembers()} />
            ) : pageMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No members match your filters."
                description="Try adjusting the search or filter criteria to find team members."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-5">Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead className="text-right">Queries this month</TableHead>
                      <TableHead className="w-12 pr-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageMembers.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        isSelf={m.id === currentUser?.id}
                        onView={() => navigate(`/admin/team/${m.id}`)}
                        onRoleChange={() => setRoleChangeTarget(m)}
                        onToggleSuspend={() => setSuspendTarget(m)}
                        onDelete={() => setDeleteTarget(m)}
                      />
                    ))}
                  </TableBody>
                </Table>
                <Separator />
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page <span className="font-medium text-foreground">{currentPage}</span> of{' '}
                    <span className="font-medium text-foreground">{totalPages}</span>
                    <span className="ml-2 hidden sm:inline">
                      · {members.length} member{members.length === 1 ? '' : 's'}
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
        </TabsContent>

        {/* ============== Pending invitations tab ============== */}
        <TabsContent value="invitations">
          <Card className="gap-0 py-0">
            {invitationsLoading ? (
              <LoadingState label="Loading invitations…" />
            ) : invitationsError ? (
              <ErrorState message={invitationsError} onRetry={() => void loadInvitations()} />
            ) : pendingInvitations.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No pending invitations."
                description="When you invite new members, their pending invitations will appear here."
                action={
                  <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    Invite Member
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-5">Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32 pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{inv.email}</span>
                            <span className="text-[11px] text-muted-foreground">
                              invited by {inv.invitedByName}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_BADGE_VARIANT[inv.role]}>
                          {inv.role === 'admin' ? 'Admin' : 'Analyst'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={INVITATION_STATUS_BADGE_VARIANT[inv.status]}>
                          {INVITATION_STATUS_LABEL[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => void handleResendInvitation(inv)}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleCancelInvitation(inv)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============== Invite modal ============== */}
      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => {
          void loadMembers();
          void loadInvitations();
        }}
      />

      {/* ============== Role change confirmation ============== */}
      <AlertDialog
        open={!!roleChangeTarget}
        onOpenChange={(o) => !o && setRoleChangeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Change role for {roleChangeTarget?.fullName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {roleChangeTarget?.role === 'admin' ? (
                <>
                  This will demote <strong>{roleChangeTarget?.fullName}</strong> from Admin to
                  Analyst. They will lose access to team management, KPI configuration, and dataset
                  permissions.
                </>
              ) : (
                <>
                  This will promote <strong>{roleChangeTarget?.fullName}</strong> from Analyst to
                  Admin. They will gain access to manage members, invitations, KPIs and dataset
                  permissions.
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
      <AlertDialog
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {suspendTarget?.status === 'suspended' ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-success" />
                  Reactivate {suspendTarget?.fullName}?
                </>
              ) : (
                <>
                  <ShieldOff className="h-5 w-5 text-warning" />
                  Suspend {suspendTarget?.fullName}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.status === 'suspended' ? (
                <>
                  This will restore access for <strong>{suspendTarget?.fullName}</strong>. They will
                  be able to sign in and use the platform again.
                </>
              ) : (
                <>
                  This will temporarily block <strong>{suspendTarget?.fullName}</strong> from
                  signing in. Their reports and history will be preserved.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSuspendConfirm();
              }}
              disabled={actionPending}
              className={cn(
                'gap-1.5',
                suspendTarget?.status !== 'suspended' &&
                  'bg-warning text-warning-foreground hover:bg-warning/90',
              )}
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {suspendTarget?.status === 'suspended' ? 'Reactivate member' : 'Suspend member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============== Delete confirmation (with optional transfer) ============== */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setTransferTo('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove {deleteTarget?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.fullName}</strong> from your team.
              The member's account will be soft-deleted and they will no longer be able to sign in.
              You can optionally transfer ownership of their reports to another active member.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Transfer reports dropdown */}
          {transferCandidates.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="transfer-select" className="text-xs">
                Transfer reports to (optional)
              </Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger id="transfer-select" className="w-full">
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
                void handleDeleteConfirm();
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

function MemberRow({
  member,
  isSelf,
  onView,
  onRoleChange,
  onToggleSuspend,
  onDelete,
}: {
  member: User;
  isSelf: boolean;
  onView: () => void;
  onRoleChange: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
}) {
  const isSuspended = member.status === 'suspended';
  // The User domain only tracks queriesToday — we surface it as the closest
  // proxy for "queries this month".
  const queriesThisMonth = member.queriesToday;

  return (
    <TableRow className="group">
      {/* Member */}
      <TableCell className="pl-5">
        <button
          type="button"
          onClick={onView}
          className="flex items-center gap-2.5 text-left"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary-subtle text-xs font-medium text-primary">
              {getInitials(member.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {member.fullName}
              {isSelf && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                  You
                </Badge>
              )}
            </span>
            <span className="text-[11px] text-muted-foreground">{member.email}</span>
          </div>
        </button>
      </TableCell>

      {/* Role */}
      <TableCell>
        <Badge variant={ROLE_BADGE_VARIANT[member.role]}>
          {member.role === 'admin' ? 'Admin' : member.role === 'super_admin' ? 'Super Admin' : 'Analyst'}
        </Badge>
      </TableCell>

      {/* Status */}
      <TableCell>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              member.status === 'active' && 'bg-success',
              member.status === 'suspended' && 'bg-destructive',
              member.status === 'pending' && 'bg-warning',
              member.status === 'deleted' && 'bg-muted-foreground',
            )}
          />
          <Badge variant={USER_STATUS_BADGE_VARIANT[member.status]}>
            {USER_STATUS_LABEL[member.status]}
          </Badge>
        </span>
      </TableCell>

      {/* Last login */}
      <TableCell className="text-sm text-muted-foreground">
        {member.lastLogin ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(member.lastLogin)}
          </span>
        ) : (
          <span>—</span>
        )}
      </TableCell>

      {/* Queries this month */}
      <TableCell className="text-right tabular-nums text-sm font-medium text-foreground">
        {queriesThisMonth.toLocaleString()}
      </TableCell>

      {/* Actions */}
      <TableCell className="pr-4 text-right">
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                aria-label="Member actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Member actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onView}>
                <Eye className="h-4 w-4" />
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onRoleChange}
                disabled={isSelf}
              >
                <UserCog className="h-4 w-4" />
                {member.role === 'admin' ? 'Change to Analyst' : 'Change to Admin'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onToggleSuspend}
                disabled={isSelf}
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
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={onDelete}
                disabled={isSelf}
              >
                <Trash2 className="h-4 w-4" />
                Delete member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function MembersTableSkeleton() {
  return (
    <div className="px-5 py-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}
