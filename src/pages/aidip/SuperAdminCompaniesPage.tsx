/**
 * AIDIP — Super Admin Companies Page — CDC §11 (Module 11).
 *
 * Tenant list with premium filters and row tinting for subscription
 * expiration visual cues (red=expired / orange≤7d / yellow≤30d).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Company, CompanyPlan, CompanyStatus } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';

import {
  PageContainer,
  PageHeader,
  ErrorState,
  EmptyState,
} from '@/components/aidip/PagePrimitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { formatDate, formatNumber, getInitials } from '@/lib/aidip/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

type PlanFilter = 'all' | CompanyPlan;
type StatusFilter = 'all' | CompanyStatus;
type ExpirationFilter = 'all' | 'expiring_30d' | 'expiring_7d' | 'expired';

const PLAN_LABEL: Record<CompanyPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

const PLAN_BADGE_CLASS: Record<CompanyPlan, string> = {
  free: 'border-border bg-muted text-muted-foreground',
  pro: 'border-primary/30 bg-primary-subtle text-primary',
  enterprise:
    'border-chart-3/30 bg-[color:var(--chart-3)]/10 text-[color:var(--chart-3)]',
  custom: 'border-chart-4/30 bg-[color:var(--chart-4)]/10 text-[color:var(--chart-4)]',
};

const STATUS_LABEL: Record<CompanyStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
};

const STATUS_BADGE_CLASS: Record<CompanyStatus, string> = {
  active: 'border-success/30 bg-success-subtle text-success',
  suspended: 'border-warning/30 bg-warning-subtle text-warning',
  deleted: 'border-destructive/30 bg-destructive-subtle text-destructive',
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function expirationTier(c: Company): 'expired' | '7d' | '30d' | 'ok' {
  if (c.status === 'deleted') return 'expired';
  const d = daysUntil(c.subscriptionEnd);
  if (d === null) return 'ok';
  if (d < 0) return 'expired';
  if (d <= 7) return '7d';
  if (d <= 30) return '30d';
  return 'ok';
}

const ROW_TINT: Record<string, string> = {
  expired: 'bg-destructive/[0.04] hover:bg-destructive/[0.07]',
  '7d': 'bg-warning/[0.05] hover:bg-warning/[0.08]',
  '30d': 'bg-[#fef9c3]/40 hover:bg-[#fef9c3]/60',
  ok: 'hover:bg-muted/50',
};

export function SuperAdminCompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<PlanFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [expiration, setExpiration] = useState<ExpirationFilter>('all');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await ServiceContainer.getInstance().aidip.company.list();
      setCompanies(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load companies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(1);
  }, [search, plan, status, expiration]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.domain ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (plan !== 'all' && c.plan !== plan) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (expiration !== 'all') {
        const tier = expirationTier(c);
        if (expiration === 'expired' && tier !== 'expired') return false;
        if (expiration === 'expiring_7d' && tier !== '7d') return false;
        if (expiration === 'expiring_30d' && tier !== '30d') return false;
      }
      return true;
    });
  }, [companies, search, plan, status, expiration]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleToggleSuspend = async (c: Company) => {
    try {
      const svc = ServiceContainer.getInstance().aidip.company;
      if (c.status === 'suspended') {
        await svc.reactivate(c.id);
        toast.success(`${c.name} reactivated.`);
      } else {
        await svc.suspend(c.id);
        toast.success(`${c.name} suspended.`);
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ServiceContainer.getInstance().aidip.company.softDelete(deleteTarget.id);
      toast.success(`${deleteTarget.name} soft-deleted (grace period: 30 days).`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Companies"
        subtitle="Manage all client tenants on the AIDIP platform."
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/super-admin/companies/new">
              <Plus className="h-4 w-4" />
              New Company
            </Link>
          </Button>
        }
      />

      {/* Toolbar */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or domain…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={plan} onValueChange={(v) => setPlan(v as PlanFilter)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={expiration}
              onValueChange={(v) => setExpiration(v as ExpirationFilter)}
            >
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue placeholder="Expiration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subscriptions</SelectItem>
                <SelectItem value="expiring_30d">Expiring in 30 days</SelectItem>
                <SelectItem value="expiring_7d">Expiring in 7 days</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <CompaniesTableSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No companies match your filters."
            description="Try adjusting your search or filters to see more tenants."
            action={
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/super-admin/companies/new">
                  <Plus className="h-4 w-4" />
                  New Company
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-5">Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Queries (this month)</TableHead>
                <TableHead>Subscription ends</TableHead>
                <TableHead className="text-right pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => {
                const tier = expirationTier(c);
                const tint = ROW_TINT[tier];
                const daysLeft = daysUntil(c.subscriptionEnd);
                return (
                  <TableRow key={c.id} className={cn('transition-colors', tint)}>
                    <TableCell className="pl-5">
                      <Link
                        to={`/super-admin/companies/${c.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar className="h-9 w-9 rounded-md">
                          <AvatarFallback className="rounded-md bg-primary-subtle text-xs font-semibold text-primary">
                            {getInitials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium text-foreground hover:text-primary">
                            {c.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {c.domain ?? '—'}
                          </span>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px] capitalize', PLAN_BADGE_CLASS[c.plan])}>
                        {PLAN_LABEL[c.plan]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px] capitalize', STATUS_BADGE_CLASS[c.status])}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{c.maxUsers}</span>
                      <span className="text-xs"> max</span>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">
                      {formatNumber(c.queriesToday * 30)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">
                          {formatDate(c.subscriptionEnd)}
                        </span>
                        {daysLeft !== null && c.status !== 'deleted' && (
                          <span
                            className={cn(
                              'text-[10px]',
                              daysLeft < 0
                                ? 'text-destructive'
                                : daysLeft <= 7
                                  ? 'text-warning'
                                  : daysLeft <= 30
                                    ? 'text-[#a16207]'
                                    : 'text-muted-foreground',
                            )}
                          >
                            {daysLeft < 0
                              ? `Expired ${Math.abs(daysLeft)}d ago`
                              : `${daysLeft} days left`}
                          </span>
                        )}
                        {c.status === 'deleted' && (
                          <span className="text-[10px] text-destructive">Soft-deleted</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Link to={`/super-admin/companies/${c.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => navigate(`/super-admin/companies/${c.id}`)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleSuspend(c)}
                              disabled={c.status === 'deleted'}
                            >
                              {c.status === 'suspended' ? (
                                <>
                                  <Play className="h-3.5 w-3.5" />
                                  Reactivate
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3.5 w-3.5" />
                                  Suspend
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(c)}
                              disabled={c.status === 'deleted'}
                              className="text-destructive focus:bg-destructive-subtle focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Soft delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Pagination */}
      {!loading && !error && filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length} companies
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="text-xs font-medium text-foreground">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Soft-delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soft-delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The company will be marked as deleted and inaccessible to its users. Its data is
              retained for a 30-day grace period before permanent removal. You can reactivate it
              from the same menu during the grace period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Soft delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Skeleton
---------------------------------------------------------------------------- */

function CompaniesTableSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-5 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      {/* Rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0"
        >
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-7 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}
