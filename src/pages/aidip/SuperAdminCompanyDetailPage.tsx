/**
 * AIDIP — Super Admin Company Detail Page — CDC §11 (Module 11).
 *
 * Full tenant management with 7 tabs:
 *   Overview · Users · Analytics · Fabric Config · AI Config · Logs · Support
 *
 * Secrets (Service Principal secret + AI API key) are AES-256 encrypted on
 * save and never displayed afterwards — masked with •••••• placeholders.
 *
 * Impersonation: starts an audited session via the ImpersonateModal. On
 * success the page force-reloads so the AppShell mounts the red banner
 * and the target user's data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Loader2,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  TestTube,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  AIProvider,
  AuditAction,
  AuditLog,
  AuthType,
  Company,
  CompanyPlan,
  CompanyStatus,
  Incident,
  IncidentSeverity,
  TeamAnalytics,
  User,
} from '@/lib/aidip/types';
import { ROLE_LABEL } from '@/lib/aidip/types';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTION_VALUES,
  INCIDENT_SEVERITY_LABEL,
  ROLE_BADGE_VARIANT,
  USER_STATUS_BADGE_VARIANT,
  USER_STATUS_LABEL,
} from '@/lib/aidip/constants';
import { ServiceContainer } from '@/services/ServiceContainer';

import {
  PageContainer,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/aidip/PagePrimitives';
import { ImpersonateModal } from '@/components/aidip/ImpersonateModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  getInitials,
  quotaPercent,
  quotaWarningLevel,
} from '@/lib/aidip/format';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'users' | 'analytics' | 'fabric' | 'ai' | 'logs' | 'support';

const PLAN_LABEL: Record<CompanyPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
  custom: 'Custom',
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

const SEVERITY_BADGE_CLASS: Record<IncidentSeverity, string> = {
  critical: 'border-destructive/30 bg-destructive-subtle text-destructive',
  major: 'border-warning/30 bg-warning-subtle text-warning',
  minor: 'border-primary/30 bg-primary-subtle text-primary',
};

const CHART_COLORS = ['#0078d4', '#2dd4bf', '#6366f1', '#f59e0b', '#ec4899'];
const MASKED_SECRET = '••••••••••••';

export function SuperAdminCompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const c = await ServiceContainer.getInstance().aidip.company.get(companyId);
      if (!c) {
        setError('Company not found.');
        return;
      }
      setCompany(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load company.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSuspendToggle = async () => {
    if (!company) return;
    setActionPending(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.company;
      const updated =
        company.status === 'suspended'
          ? await svc.reactivate(company.id)
          : await svc.suspend(company.id);
      setCompany(updated);
      toast.success(
        updated.status === 'suspended'
          ? `${updated.name} suspended.`
          : `${updated.name} reactivated.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setActionPending(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!company) return;
    setActionPending(true);
    try {
      await ServiceContainer.getInstance().aidip.company.softDelete(company.id);
      toast.success(`${company.name} soft-deleted.`);
      navigate('/super-admin/companies');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
      setActionPending(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <LoadingState label="Loading company…" />
      </PageContainer>
    );
  }
  if (error) {
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={load} />
      </PageContainer>
    );
  }
  if (!company) return null;

  return (
    <PageContainer>
      {/* Custom header — PageHeader's title prop is typed as string */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate('/super-admin/companies')}
            aria-label="Back to companies"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10 rounded-md">
            <AvatarFallback className="rounded-md bg-primary-subtle text-sm font-semibold text-primary">
              {getInitials(company.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {company.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {company.domain ?? 'No domain'} · created {formatDate(company.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {PLAN_LABEL[company.plan]}
          </Badge>
          <Badge
            variant="outline"
            className={cn('capitalize', STATUS_BADGE_CLASS[company.status])}
          >
            {STATUS_LABEL[company.status]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSuspendToggle}
            disabled={actionPending || company.status === 'deleted'}
            className="gap-1.5"
          >
            {company.status === 'suspended' ? (
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
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={actionPending || company.status === 'deleted'}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive-subtle"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Soft delete
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="fabric" className="gap-1.5">
            <Database className="h-3.5 w-3.5" /> Fabric Config
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Config
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Logs
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Support
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab company={company} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab company={company} />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsTab />
        </TabsContent>
        <TabsContent value="fabric">
          <FabricConfigTab company={company} onSaved={load} />
        </TabsContent>
        <TabsContent value="ai">
          <AiConfigTab company={company} onSaved={load} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab company={company} />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab company={company} onSaved={load} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soft-delete {company.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The company will be marked as deleted and inaccessible to its users. Data is retained
              for a 30-day grace period before permanent removal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSoftDelete}
              disabled={actionPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {actionPending ? 'Deleting…' : 'Soft delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Overview tab
---------------------------------------------------------------------------- */

function OverviewTab({ company }: { company: Company }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    ServiceContainer.getInstance()
      .aidip.auditLog.list()
      .then((items) => {
        if (cancelled) return;
        setLogs(items.filter((l) => l.companyId === company.id).slice(0, 5));
      })
      .finally(() => !cancelled && setLogsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  const queriesLevel = quotaWarningLevel(company.queriesToday, company.maxQueriesPerDay);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Company info */}
      <Card className="lg:col-span-1">
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Company information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-4 text-sm">
          <InfoRow label="Name" value={company.name} />
          <InfoRow label="Domain" value={company.domain ?? '—'} />
          <InfoRow label="Plan" value={PLAN_LABEL[company.plan]} />
          <InfoRow label="Status" value={STATUS_LABEL[company.status]} />
          <InfoRow label="Timezone" value={company.defaultTimezone} />
          <InfoRow label="Currency" value={company.defaultCurrency} />
          <Separator className="my-2" />
          <InfoRow label="Created" value={formatDate(company.createdAt)} />
          <InfoRow label="Updated" value={formatRelativeTime(company.updatedAt)} />
          <InfoRow
            label="Subscription"
            value={`${formatDate(company.subscriptionStart)} → ${formatDate(company.subscriptionEnd)}`}
          />
          <Separator className="my-2" />
          <InfoRow label="Max users" value={formatNumber(company.maxUsers)} />
          <InfoRow label="Max queries / day" value={formatNumber(company.maxQueriesPerDay)} />
          <InfoRow label="Storage" value={`${company.storageGb} GB`} />
        </CardContent>
      </Card>

      {/* Usage */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageCard
            label="Queries today"
            used={company.queriesToday}
            max={company.maxQueriesPerDay}
            level={queriesLevel}
          />
          <UsageCard
            label="Active users"
            used={Math.floor(company.maxUsers * 0.7)}
            max={company.maxUsers}
            level="ok"
          />
          <UsageCard
            label="Storage used"
            used={Math.floor(company.storageGb * 0.4)}
            max={company.storageGb}
            unit="GB"
            level="ok"
          />
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
            <CardTitle className="text-sm">Recent activity (audit log)</CardTitle>
            <span className="text-[11px] text-muted-foreground">Last 5 entries</span>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <LoadingState label="Loading audit log…" />
            ) : logs.length === 0 ? (
              <EmptyState icon={FileText} title="No recent activity" />
            ) : (
              <ul className="divide-y divide-border">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {AUDIT_ACTION_LABEL[l.action] ?? l.action}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {l.severity}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {l.userName} · {formatDateTime(l.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

const LEVEL_BAR: Record<'ok' | 'warning' | 'critical', string> = {
  ok: '[&>[data-slot=progress-indicator]]:bg-success',
  warning: '[&>[data-slot=progress-indicator]]:bg-warning',
  critical: '[&>[data-slot=progress-indicator]]:bg-destructive',
};

function UsageCard({
  label,
  used,
  max,
  unit = 'queries',
  level = 'ok',
}: {
  label: string;
  used: number;
  max: number;
  unit?: string;
  level?: 'ok' | 'warning' | 'critical';
}) {
  const pct = quotaPercent(used, max);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 px-5 py-4">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatNumber(used)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {formatNumber(max)} {unit}
              </span>
            </div>
          </div>
          <span
            className={cn(
              'text-xs font-medium',
              level === 'ok'
                ? 'text-success'
                : level === 'warning'
                  ? 'text-warning'
                  : 'text-destructive',
            )}
          >
            {pct}%
          </span>
        </div>
        <Progress value={pct} className={cn('h-1.5', LEVEL_BAR[level])} />
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Users tab
---------------------------------------------------------------------------- */

function UsersTab({ company }: { company: Company }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [impersonateUser, setImpersonateUser] = useState<User | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // MockUserService.listByCompany returns the current session's company
      // users. For super admins (no companyId), this returns []. In a real
      // backend, super admins would receive a scoped list for the requested
      // tenant — for the MVP demo we surface whatever the service returns
      // and filter client-side by company id.
      const items = await ServiceContainer.getInstance().aidip.user.listByCompany({
        search: search || undefined,
      });
      setUsers(items.filter((u) => u.companyId === company.id));
    } finally {
      setLoading(false);
    }
  }, [company.id, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = users.filter(
    (u) =>
      !search ||
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" />
          Members ({users.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search…"
            className="h-8 w-48 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
            <UserCog className="h-3.5 w-3.5" />
            Invite Admin
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <LoadingState label="Loading members…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members found"
            description="This company has no active members yet, or your search returned no results."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-5">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Queries today</TableHead>
                <TableHead className="text-right pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
                          {getInitials(u.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {u.fullName}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE_VARIANT[u.role]} className="text-[10px]">
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={USER_STATUS_BADGE_VARIANT[u.status]}
                      className="text-[10px] capitalize"
                    >
                      {USER_STATUS_LABEL[u.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.lastLogin ? formatRelativeTime(u.lastLogin) : '—'}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {formatNumber(u.queriesToday)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setImpersonateUser(u)}
                      disabled={u.status !== 'active'}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Impersonate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ImpersonateModal
        open={!!impersonateUser}
        onOpenChange={(o) => !o && setImpersonateUser(null)}
        targetUserId={impersonateUser?.id}
        targetUserName={impersonateUser?.fullName}
      />

      {/* Invite Admin (mock) */}
      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite Company Admin</AlertDialogTitle>
            <AlertDialogDescription>
              An invitation email will be sent with a forced <strong>admin</strong> role
              (non-editable). The invitee will be able to manage members, KPIs and dataset
              permissions within {company.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 px-1">
            <Label className="text-xs">Admin email</Label>
            <Input type="email" placeholder="admin@example.com" />
            <p className="text-[11px] text-muted-foreground">
              The role is locked to{' '}
              <Badge variant="outline" className="text-[10px]">
                Admin
              </Badge>{' '}
              and cannot be changed during invitation.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setInviteOpen(false);
                toast.success('Admin invitation sent (mock).');
              }}
            >
              Send invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Analytics tab — reuses team analytics display
---------------------------------------------------------------------------- */

function AnalyticsTab() {
  const [data, setData] = useState<TeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ServiceContainer.getInstance()
      .aidip.analytics.getTeamAnalytics()
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState label="Loading analytics…" />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Active users today" value={formatNumber(data.activeUsersToday)} />
        <MiniStat label="Queries this month" value={formatNumber(data.totalQueriesThisMonth)} />
        <MiniStat label="Reports this month" value={formatNumber(data.reportsCreatedThisMonth)} />
        <MiniStat label="Avg. response time" value={`${data.avgResponseTimeSec.toFixed(1)}s`} />
      </div>

      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Query evolution (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.queryEvolution30d} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="grad-queries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0078d4" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0078d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <RechartsTooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: number) => [formatNumber(v), 'Queries']}
              />
              <Area
                type="monotone"
                dataKey="queries"
                stroke="#0078d4"
                strokeWidth={2}
                fill="url(#grad-queries)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm">Queries per user</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                layout="vertical"
                data={data.queryDistributionPerUser.slice(0, 8)}
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="userName"
                  width={100}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [formatNumber(v), 'Queries']}
                  cursor={{ fill: 'rgba(0,120,212,0.06)' }}
                />
                <Bar dataKey="queries" radius={[0, 4, 4, 0]}>
                  {data.queryDistributionPerUser.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm">Top report creators</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="flex flex-col gap-2">
              {data.topReportCreators.map((c, i) => (
                <li
                  key={c.userName}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-subtle text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {c.userName}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {formatNumber(c.count)} reports
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 px-4 py-3">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Fabric Config tab
---------------------------------------------------------------------------- */

interface FabricForm {
  fabricWorkspaceId: string;
  fabricSemanticModelId: string;
  azureTenantId: string;
  servicePrincipalClientId: string;
  servicePrincipalClientSecret: string; // empty = unchanged
  xmlaEndpoint: string;
  authType: AuthType;
}

function FabricConfigTab({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FabricForm>({
    fabricWorkspaceId: company.fabricWorkspaceId ?? '',
    fabricSemanticModelId: company.fabricSemanticModelId ?? '',
    azureTenantId: company.azureTenantId ?? '',
    servicePrincipalClientId: company.servicePrincipalClientId ?? '',
    servicePrincipalClientSecret: '',
    xmlaEndpoint: company.xmlaEndpoint ?? '',
    authType: company.authType,
  });
  const [secretEditing, setSecretEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const hasStoredSecret = !!company.servicePrincipalClientSecretEnc;

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Partial<Company> = {
        fabricWorkspaceId: form.fabricWorkspaceId || null,
        fabricSemanticModelId: form.fabricSemanticModelId || null,
        azureTenantId: form.azureTenantId || null,
        servicePrincipalClientId: form.servicePrincipalClientId || null,
        xmlaEndpoint: form.xmlaEndpoint || null,
        authType: form.authType,
      };
      if (secretEditing && form.servicePrincipalClientSecret) {
        // Mock: store a masked marker simulating AES-256 encrypted value
        patch.servicePrincipalClientSecretEnc = MASKED_SECRET;
      }
      await ServiceContainer.getInstance().aidip.company.update(company.id, patch);
      toast.success('Fabric configuration saved.');
      setSecretEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await ServiceContainer.getInstance().aidip.company.testFabricConnection(
        company.id,
      );
      setTestResult(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const result = await ServiceContainer.getInstance().aidip.company.extractSemanticSchema(
        company.id,
      );
      if (result.ok) {
        toast.success(`Schema extracted: ${result.tablesFound} tables found.`);
      } else {
        toast.error('Schema extraction failed.');
      }
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="h-4 w-4 text-primary" />
          Microsoft Fabric connection
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldLabel label="Fabric workspace ID">
            <Input
              value={form.fabricWorkspaceId}
              onChange={(e) => setForm({ ...form, fabricWorkspaceId: e.target.value })}
              placeholder="ws-xxxx-xxxx-xxxx"
            />
          </FieldLabel>
          <FieldLabel label="Semantic model ID">
            <Input
              value={form.fabricSemanticModelId}
              onChange={(e) => setForm({ ...form, fabricSemanticModelId: e.target.value })}
              placeholder="sm-xxxx-v1"
            />
          </FieldLabel>
          <FieldLabel label="Azure tenant ID">
            <Input
              value={form.azureTenantId}
              onChange={(e) => setForm({ ...form, azureTenantId: e.target.value })}
              placeholder="tenant-xxxx-xxxx"
            />
          </FieldLabel>
          <FieldLabel label="XMLA endpoint">
            <Input
              value={form.xmlaEndpoint}
              onChange={(e) => setForm({ ...form, xmlaEndpoint: e.target.value })}
              placeholder="powerbi://api.powerbi.com/v1.0/myorg/workspace"
            />
          </FieldLabel>
          <FieldLabel label="Service principal client ID">
            <Input
              value={form.servicePrincipalClientId}
              onChange={(e) => setForm({ ...form, servicePrincipalClientId: e.target.value })}
              placeholder="sp-xxxx-xxxx"
            />
          </FieldLabel>
          <FieldLabel label="Auth type">
            <Select
              value={form.authType}
              onValueChange={(v) => setForm({ ...form, authType: v as AuthType })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service_principal">Service Principal</SelectItem>
                <SelectItem value="delegated">Delegated</SelectItem>
              </SelectContent>
            </Select>
          </FieldLabel>
        </div>

        {/* Secret field — masked */}
        <FieldLabel
          label="Service principal client secret"
          hint="AES-256 encrypted at rest. Never displayed after save."
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              {secretEditing ? (
                <Input
                  type="password"
                  className="pl-9"
                  placeholder="Paste secret — will be encrypted on save"
                  value={form.servicePrincipalClientSecret}
                  onChange={(e) =>
                    setForm({ ...form, servicePrincipalClientSecret: e.target.value })
                  }
                />
              ) : (
                <Input
                  className="pl-9 font-mono text-muted-foreground"
                  value={hasStoredSecret ? MASKED_SECRET : '— not set —'}
                  readOnly
                />
              )}
            </div>
            {hasStoredSecret && !secretEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSecretEditing(true)}
                className="gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                Replace
              </Button>
            )}
            {secretEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSecretEditing(false);
                  setForm({ ...form, servicePrincipalClientSecret: '' });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </FieldLabel>

        {/* Test result banner */}
        {testResult && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border px-3.5 py-3 text-xs',
              testResult.ok
                ? 'border-success/30 bg-success-subtle text-success'
                : 'border-destructive/30 bg-destructive-subtle text-destructive',
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="gap-1.5">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
            Test Fabric Connection
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExtract}
            disabled={extracting}
            className="gap-1.5"
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Extract Schema
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Fabric Config
          </Button>
        </div>

        <div className="rounded-md border border-primary/20 bg-primary-subtle px-3.5 py-3 text-xs text-primary">
          Service Principal secret is AES-256 encrypted and never displayed after save.
        </div>
      </CardContent>
    </Card>
  );
}

function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   AI Config tab
---------------------------------------------------------------------------- */

interface AiForm {
  aiProvider: AIProvider;
  azureOpenaiEndpoint: string;
  azureOpenaiApiKey: string;
  modelChatFast: string;
  modelChatComplex: string;
  modelReport: string;
  maxTokensPerRequest: number;
  aiDailyTokenBudget: number;
}

function AiConfigTab({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [form, setForm] = useState<AiForm>({
    aiProvider: company.aiProvider,
    azureOpenaiEndpoint: company.azureOpenaiEndpoint ?? '',
    azureOpenaiApiKey: '',
    modelChatFast: company.modelChatFast,
    modelChatComplex: company.modelChatComplex,
    modelReport: company.modelReport,
    maxTokensPerRequest: company.maxTokensPerRequest,
    aiDailyTokenBudget: company.aiDailyTokenBudget,
  });
  const [keyEditing, setKeyEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasStoredKey = !!company.azureOpenaiApiKeyEnc;

  // Token consumption mock — derived from queries today
  const tokensToday = company.queriesToday * 850;
  const tokensMonth = tokensToday * 22;
  const budgetPct = Math.min(100, Math.round((tokensToday / form.aiDailyTokenBudget) * 100));
  const estimatedCostUsd = (tokensToday / 1_000_000) * 5;

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Partial<Company> = {
        aiProvider: form.aiProvider,
        azureOpenaiEndpoint: form.azureOpenaiEndpoint || null,
        modelChatFast: form.modelChatFast,
        modelChatComplex: form.modelChatComplex,
        modelReport: form.modelReport,
        maxTokensPerRequest: form.maxTokensPerRequest,
        aiDailyTokenBudget: form.aiDailyTokenBudget,
      };
      if (keyEditing && form.azureOpenaiApiKey) {
        patch.azureOpenaiApiKeyEnc = MASKED_SECRET;
      }
      await ServiceContainer.getInstance().aidip.company.update(company.id, patch);
      toast.success('AI configuration saved.');
      setKeyEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            AI provider configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldLabel label="AI provider">
              <Select
                value={form.aiProvider}
                onValueChange={(v) => setForm({ ...form, aiProvider: v as AIProvider })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="azure_openai">Azure OpenAI</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </FieldLabel>
            <FieldLabel label="Azure OpenAI endpoint">
              <Input
                value={form.azureOpenaiEndpoint}
                onChange={(e) => setForm({ ...form, azureOpenaiEndpoint: e.target.value })}
                placeholder="https://<resource>.openai.azure.com/"
              />
            </FieldLabel>
            <FieldLabel label="Model — chat fast" hint="Used for short queries & suggestions.">
              <Input
                value={form.modelChatFast}
                onChange={(e) => setForm({ ...form, modelChatFast: e.target.value })}
                placeholder="gpt-4o-mini"
              />
            </FieldLabel>
            <FieldLabel label="Model — chat complex" hint="Used for multi-step reasoning.">
              <Input
                value={form.modelChatComplex}
                onChange={(e) => setForm({ ...form, modelChatComplex: e.target.value })}
                placeholder="gpt-4.1"
              />
            </FieldLabel>
            <FieldLabel label="Model — report" hint="Used for report generation.">
              <Input
                value={form.modelReport}
                onChange={(e) => setForm({ ...form, modelReport: e.target.value })}
                placeholder="gpt-4.1"
              />
            </FieldLabel>
            <FieldLabel label="Max tokens per request">
              <Input
                type="number"
                value={form.maxTokensPerRequest}
                onChange={(e) =>
                  setForm({ ...form, maxTokensPerRequest: Number(e.target.value) })
                }
              />
            </FieldLabel>
            <FieldLabel label="Daily token budget">
              <Input
                type="number"
                value={form.aiDailyTokenBudget}
                onChange={(e) =>
                  setForm({ ...form, aiDailyTokenBudget: Number(e.target.value) })
                }
              />
            </FieldLabel>
          </div>

          {/* API key — masked */}
          <FieldLabel
            label="Azure OpenAI API key"
            hint="AES-256 encrypted at rest. Never displayed after save."
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                {keyEditing ? (
                  <Input
                    type="password"
                    className="pl-9"
                    placeholder="Paste key — will be encrypted on save"
                    value={form.azureOpenaiApiKey}
                    onChange={(e) => setForm({ ...form, azureOpenaiApiKey: e.target.value })}
                  />
                ) : (
                  <Input
                    className="pl-9 font-mono text-muted-foreground"
                    value={hasStoredKey ? MASKED_SECRET : '— not set —'}
                    readOnly
                  />
                )}
              </div>
              {hasStoredKey && !keyEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setKeyEditing(true)}
                  className="gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Replace
                </Button>
              )}
              {keyEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKeyEditing(false);
                    setForm({ ...form, azureOpenaiApiKey: '' });
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </FieldLabel>

          <div className="flex items-center justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save AI Config
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Token consumption summary */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-primary" />
            Token consumption summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Today</span>
              <span className="text-xl font-bold text-foreground">{formatNumber(tokensToday)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">This month</span>
              <span className="text-xl font-bold text-foreground">{formatNumber(tokensMonth)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Estimated cost</span>
              <span className="text-xl font-bold text-foreground">
                ${estimatedCostUsd.toFixed(2)}
              </span>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Budget utilization</span>
              <span
                className={cn(
                  'font-medium',
                  budgetPct >= 100
                    ? 'text-destructive'
                    : budgetPct >= 80
                      ? 'text-warning'
                      : 'text-success',
                )}
              >
                {budgetPct}% of {formatNumber(form.aiDailyTokenBudget)} tokens
              </span>
            </div>
            <Progress
              value={budgetPct}
              className={cn(
                'h-2',
                budgetPct >= 100
                  ? '[&>[data-slot=progress-indicator]]:bg-destructive'
                  : budgetPct >= 80
                    ? '[&>[data-slot=progress-indicator]]:bg-warning'
                    : '[&>[data-slot=progress-indicator]]:bg-success',
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Logs tab
---------------------------------------------------------------------------- */

function LogsTab({ company }: { company: Company }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'all' | AuditAction>('all');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await ServiceContainer.getInstance().aidip.auditLog.list({
        action: action === 'all' ? undefined : action,
        userId: userId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      });
      setLogs(items.filter((l) => l.companyId === company.id));
    } finally {
      setLoading(false);
    }
  }, [action, userId, from, to, company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async () => {
    try {
      const csv = await ServiceContainer.getInstance().aidip.auditLog.exportCsv();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${company.slug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-primary" />
          Audit log ({logs.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={action} onValueChange={(v) => setAction(v as 'all' | AuditAction)}>
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTION_VALUES.map((a) => (
                <SelectItem key={a} value={a}>
                  {AUDIT_ACTION_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="text"
            placeholder="User ID"
            className="h-8 w-32 text-xs"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <LoadingState label="Loading audit log…" />
        ) : logs.length === 0 ? (
          <EmptyState icon={FileText} title="No log entries match your filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="pr-5">Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-5 text-xs text-muted-foreground">
                    {formatDateTime(l.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{l.userName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {AUDIT_ACTION_LABEL[l.action] ?? l.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] capitalize',
                        l.severity === 'critical'
                          ? 'border-destructive/30 bg-destructive-subtle text-destructive'
                          : l.severity === 'warning'
                            ? 'border-warning/30 bg-warning-subtle text-warning'
                            : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {l.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-xs text-muted-foreground">
                    {l.resourceType ? `${l.resourceType} · ${l.resourceId ?? ''}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Support tab
---------------------------------------------------------------------------- */

function SupportTab({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => void;
}) {
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [reason, setReason] = useState('');
  const [starting, setStarting] = useState(false);
  const [notes, setNotes] = useState(company.notesInternal ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load company users (will be empty for super admin due to mock scoping —
  // for MVP we surface whatever is returned and offer manual entry fallback)
  useEffect(() => {
    let cancelled = false;
    ServiceContainer.getInstance()
      .aidip.user.listByCompany()
      .then((items) => !cancelled && setUsers(items.filter((u) => u.companyId === company.id)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  // Load incidents for this company
  useEffect(() => {
    let cancelled = false;
    ServiceContainer.getInstance()
      .aidip.incident.list()
      .then((items) => {
        if (cancelled) return;
        setIncidents(items.filter((i) => i.impactedCompanyIds.includes(company.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  // Auto-save notes with debounce
  useEffect(() => {
    if (notes === (company.notesInternal ?? '')) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await ServiceContainer.getInstance().aidip.company.update(company.id, {
          notesInternal: notes,
        });
        onSaved();
      } finally {
        setNotesSaving(false);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [notes, company.id, company.notesInternal, onSaved]);

  const handleStartImpersonation = async () => {
    if (!targetUser) {
      toast.error('Select a user to impersonate.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Justification must be at least 10 characters.');
      return;
    }
    setStarting(true);
    try {
      const result = await ServiceContainer.getInstance().aidip.impersonation.start(
        targetUser.id,
        reason.trim(),
      );
      if (!result.ok) {
        toast.error(result.message ?? 'Failed to start impersonation.');
        setStarting(false);
        return;
      }
      toast.success(`Impersonating ${targetUser.fullName}.`);
      window.location.reload();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Impersonation section */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Impersonate user
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="rounded-md border border-warning/30 bg-warning-subtle px-3.5 py-2.5 text-xs text-warning">
            All actions performed during impersonation are logged. Maximum duration: 30 minutes.
            Auto-logout at expiry.
          </div>
          <FieldLabel label="Target user" hint="Select an active member of this company.">
            <Select
              value={targetUser?.id ?? ''}
              onValueChange={(id) => setTargetUser(users.find((u) => u.id === id) ?? null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a user…" />
              </SelectTrigger>
              <SelectContent>
                {users.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No members available (mock scoping)
                  </SelectItem>
                ) : (
                  users.map((u) => (
                    <SelectItem key={u.id} value={u.id} disabled={u.status !== 'active'}>
                      {u.fullName} — {u.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </FieldLabel>
          <FieldLabel
            label="Justification (required, will be logged)"
            hint="Minimum 10 characters. Stored permanently in the audit log."
          >
            <Textarea
              rows={3}
              placeholder="Explain why this impersonation is necessary…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FieldLabel>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImpersonateOpen(true)}
              disabled={!targetUser}
            >
              Open modal
            </Button>
            <Button
              size="sm"
              onClick={handleStartImpersonation}
              disabled={!targetUser || reason.trim().length < 10 || starting}
              className="gap-1.5"
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              Start impersonation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Incident history */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Incident history for this company</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidents.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No incidents recorded for this company." />
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((inc) => (
                <li key={inc.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{inc.title}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', SEVERITY_BADGE_CLASS[inc.severity])}
                    >
                      {INCIDENT_SEVERITY_LABEL[inc.severity]}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Created {formatRelativeTime(inc.createdAt)}</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="capitalize">{inc.status}</span>
                    {inc.resolvedAt && (
                      <>
                        <Separator orientation="vertical" className="h-3" />
                        <span className="text-success">
                          Resolved {formatRelativeTime(inc.resolvedAt)}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Internal HESYD notes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
          <CardTitle className="text-sm">Internal HESYD notes</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {notesSaving ? 'Saving…' : 'Auto-saved'}
          </span>
        </CardHeader>
        <CardContent className="pt-4">
          <Textarea
            rows={6}
            placeholder="Internal notes (only visible to HESYD operators)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Notes are auto-saved with debounce and stored encrypted at rest.
          </p>
        </CardContent>
      </Card>

      <ImpersonateModal
        open={impersonateOpen}
        onOpenChange={setImpersonateOpen}
        targetUserId={targetUser?.id}
        targetUserName={targetUser?.fullName}
      />
    </div>
  );
}
