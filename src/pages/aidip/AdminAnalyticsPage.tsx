/**
 * AIDIP Admin — Team Analytics dashboard (Module 7, CDC §9).
 *
 * Route: /admin/analytics  (admin + super_admin only)
 *
 * Surfaces usage KPIs, query evolution & distribution charts, a 7×24 peak
 * usage heatmap, consumption alert configuration and a paginated audit log
 * with CSV export.
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 * Charts built with `recharts`; the heatmap is a pure CSS grid.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  ShieldAlert,
  TrendingUp,
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
  AuditAction,
  AuditLog,
  AuditSeverity,
  TeamAnalytics,
  User,
  UserRole,
} from '@/lib/aidip/types';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTION_VALUES,
  ROLE_BADGE_VARIANT,
} from '@/lib/aidip/constants';
import {
  formatDateTime,
  formatNumber,
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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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

const AUDIT_PAGE_SIZE = 20;
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const AUDIT_SEVERITY_VARIANT: Record<
  AuditSeverity,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  info: 'secondary',
  warning: 'default',
  critical: 'destructive',
};

const AUDIT_SEVERITY_COLOR: Record<AuditSeverity, string> = {
  info: 'bg-muted-foreground',
  warning: 'bg-warning',
  critical: 'bg-destructive',
};

const CHART_PRIMARY = 'var(--primary)'; // #0078D4

export function AdminAnalyticsPage() {
  const { companyId } = useAidipSession();
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Audit log state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
  const [userFilter, setUserFilter] = useState<'all' | string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [logPage, setLogPage] = useState(1);

  // Team members (for user filter dropdown)
  const [members, setMembers] = useState<User[]>([]);

  // Alerts config state
  const [alerts, setAlerts] = useState({
    thresholds: [
      { pct: 50, email: true, inApp: true },
      { pct: 80, email: true, inApp: true },
      { pct: 100, email: true, inApp: true },
    ],
    blockAt100: true,
  });
  const [alertsSaving, setAlertsSaving] = useState(false);

  const [exporting, setExporting] = useState(false);

  /* -------------------------------------------------------------------------
     Loaders
  ------------------------------------------------------------------------- */
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await ServiceContainer.getInstance().aidip.analytics.getTeamAnalytics();
      setAnalytics(data);
    } catch (e) {
      setAnalyticsError(e instanceof Error ? e.message : 'Failed to load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const list = await ServiceContainer.getInstance().aidip.auditLog.list({
        action: actionFilter === 'all' ? undefined : actionFilter,
        userId: userFilter === 'all' ? undefined : userFilter,
        from: fromDate || undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      });
      setLogs(list);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load audit log.');
    } finally {
      setLogsLoading(false);
    }
  }, [actionFilter, userFilter, fromDate, toDate]);

  const loadMembers = useCallback(async () => {
    try {
      const list = await ServiceContainer.getInstance().aidip.user.listByCompany();
      setMembers(list);
    } catch {
      // Silent — the user filter will simply show "All".
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
    void loadMembers();
  }, [loadAnalytics, loadMembers]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setLogPage(1);
  }, [actionFilter, userFilter, fromDate, toDate]);

  /* -------------------------------------------------------------------------
     Derived data
  ------------------------------------------------------------------------- */
  const heatmapGrid = useMemo(() => {
    if (!analytics) return null;
    // Build a 7×24 lookup. Day 0 = Mon, 6 = Sun (matches DAYS_OF_WEEK).
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const p of analytics.peakHours) {
      if (p.day >= 0 && p.day < 7 && p.hour >= 0 && p.hour < 24) {
        grid[p.day]![p.hour] = p.queries;
      }
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [analytics]);

  const totalLogPages = Math.max(1, Math.ceil(logs.length / AUDIT_PAGE_SIZE));
  const currentLogPage = Math.min(logPage, totalLogPages);
  const pageLogs = useMemo(
    () => logs.slice((currentLogPage - 1) * AUDIT_PAGE_SIZE, currentLogPage * AUDIT_PAGE_SIZE),
    [logs, currentLogPage],
  );

  /* -------------------------------------------------------------------------
     Handlers
  ------------------------------------------------------------------------- */
  const handleSaveAlerts = async () => {
    if (!companyId) {
      toast.error('Your company profile is still loading — please retry in a moment.');
      return;
    }
    setAlertsSaving(true);
    try {
      // Persist the alert thresholds to the company's `notesInternal`
      // field (JSON-encoded under the `consumptionAlerts` key). A
      // server-side scheduler reads this config to evaluate and fire
      // email/in-app alerts when query consumption crosses each
      // threshold. Storing it on the company guarantees the config
      // survives reloads and is visible to every admin of the tenant.
      const payload = JSON.stringify({
        consumptionAlerts: {
          thresholds: alerts.thresholds.reduce<
            Record<number, { email: boolean; inApp: boolean }>
          >((acc, t) => {
            acc[t.pct] = { email: t.email, inApp: t.inApp };
            return acc;
          }, {}),
          blockAt100: alerts.blockAt100,
        },
      });
      await ServiceContainer.getInstance().aidip.company.update(companyId, {
        notesInternal: payload,
      });
      toast.success('Alert configuration saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save alert configuration.');
    } finally {
      setAlertsSaving(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csv = await ServiceContainer.getInstance().aidip.auditLog.exportCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `aidip-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Audit log exported.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export CSV.');
    } finally {
      setExporting(false);
    }
  };

  /* -------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------- */
  return (
    <PageContainer>
      <PageHeader
        title="Team Analytics"
        subtitle="Track usage, queries, and engagement across your team."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void loadAnalytics()}
            disabled={analyticsLoading}
          >
            Refresh
          </Button>
        }
      />

      {/* ============== KPI cards ============== */}
      {analyticsLoading && !analytics ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="gap-0 py-4">
              <CardContent>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : analyticsError ? (
        <Card className="mb-6">
          <ErrorState message={analyticsError} onRetry={() => void loadAnalytics()} />
        </Card>
      ) : analytics ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            icon={Users}
            label="Active users today"
            value={formatNumber(analytics.activeUsersToday)}
            tone="primary"
          />
          <KpiCard
            icon={Users}
            label="Active this week"
            value={formatNumber(analytics.activeUsersThisWeek)}
            tone="primary"
          />
          <KpiCard
            icon={TrendingUp}
            label="AI queries this month"
            value={`${formatNumber(analytics.totalQueriesThisMonth)} / ${formatNumber(analytics.queryQuota)}`}
            subValue={`${Math.round((analytics.totalQueriesThisMonth / Math.max(1, analytics.queryQuota)) * 100)}% of quota`}
            tone={
              analytics.totalQueriesThisMonth / Math.max(1, analytics.queryQuota) >= 0.8
                ? 'warning'
                : 'primary'
            }
          />
          <KpiCard
            icon={FileText}
            label="Reports this month"
            value={formatNumber(analytics.reportsCreatedThisMonth)}
            tone="primary"
          />
          <KpiCard
            icon={Download}
            label="Exports this month"
            value={formatNumber(analytics.exportsGeneratedThisMonth)}
            tone="primary"
          />
          <KpiCard
            icon={Clock}
            label="Avg response time"
            value={`${analytics.avgResponseTimeSec.toFixed(1)}s`}
            tone="primary"
          />
        </div>
      ) : null}

      {/* ============== Charts ============== */}
      {analytics && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Query evolution — Area chart */}
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" />
                Query evolution (last 30 days)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={analytics.queryEvolution30d}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="queryEvolutionFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(d: string) => d.slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                      }}
                      labelStyle={{ color: 'var(--muted-foreground)', fontWeight: 500 }}
                      formatter={(value: number) => [`${formatNumber(value)} queries`, 'Queries']}
                    />
                    <Area
                      type="monotone"
                      dataKey="queries"
                      stroke={CHART_PRIMARY}
                      strokeWidth={2}
                      fill="url(#queryEvolutionFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Query distribution per user — horizontal bar chart */}
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" />
                Query distribution per user
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={analytics.queryDistributionPerUser.slice(0, 8)}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="userName"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                      tickFormatter={(v: string) =>
                        v.length > 14 ? `${v.slice(0, 13)}…` : v
                      }
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                      }}
                      formatter={(value: number) => [`${formatNumber(value)} queries`, 'Queries']}
                    />
                    <Bar dataKey="queries" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Peak usage heatmap */}
          <Card className="gap-0 py-0 lg:col-span-2">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                Peak usage hours
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Darker cells = more queries. Hour in UTC.
              </p>
            </CardHeader>
            <CardContent className="px-5 py-4">
              {heatmapGrid ? (
                <PeakHoursHeatmap grid={heatmapGrid.grid} max={heatmapGrid.max} />
              ) : null}
            </CardContent>
          </Card>

          {/* Top 5 report creators — vertical bar chart */}
          <Card className="gap-0 py-0 lg:col-span-2">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                Top 5 report creators
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.topReportCreators}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="userName"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) =>
                        v.split(' ').map((p) => p[0]).join('').slice(0, 2)
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                      }}
                      formatter={(value: number) => [`${formatNumber(value)} reports`, 'Reports']}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                      {analytics.topReportCreators.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            i === 0
                              ? 'var(--primary)'
                              : i === 1
                                ? 'var(--chart-2)'
                                : i === 2
                                  ? 'var(--chart-3)'
                                  : i === 3
                                    ? 'var(--chart-4)'
                                    : 'var(--chart-5)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============== Consumption alerts config ============== */}
      <Card className="mb-6 gap-0 py-0">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-primary" />
            Consumption alerts
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Get notified when your team's monthly query quota crosses these thresholds.
          </p>
        </CardHeader>
        <CardContent className="px-5 py-5">
          <div className="grid gap-3">
            {alerts.thresholds.map((t, idx) => (
              <div
                key={t.pct}
                className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex items-center gap-2 sm:w-40">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={t.pct}
                    onChange={(e) => {
                      const v = Number.parseInt(e.target.value, 10);
                      setAlerts((prev) => ({
                        ...prev,
                        thresholds: prev.thresholds.map((x, i) =>
                          i === idx ? { ...x, pct: Number.isNaN(v) ? 0 : v } : x,
                        ),
                      }));
                    }}
                    className="h-8 w-20"
                    aria-label={`Threshold ${idx + 1} percentage`}
                  />
                  <span className="text-sm font-medium text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-5">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={t.email}
                      onCheckedChange={(c) =>
                        setAlerts((prev) => ({
                          ...prev,
                          thresholds: prev.thresholds.map((x, i) =>
                            i === idx ? { ...x, email: c === true } : x,
                          ),
                        }))
                      }
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={t.inApp}
                      onCheckedChange={(c) =>
                        setAlerts((prev) => ({
                          ...prev,
                          thresholds: prev.thresholds.map((x, i) =>
                            i === idx ? { ...x, inApp: c === true } : x,
                          ),
                        }))
                      }
                    />
                    In-app
                  </label>
                </div>
                {t.pct === 100 && (
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <Label htmlFor="block-100" className="text-xs text-muted-foreground">
                      Block new queries
                    </Label>
                    <Switch
                      id="block-100"
                      checked={alerts.blockAt100}
                      onCheckedChange={(c) =>
                        setAlerts((prev) => ({ ...prev, blockAt100: c === true }))
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void handleSaveAlerts()}
              disabled={alertsSaving}
            >
              {alertsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save alerts
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============== Audit log ============== */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Audit log
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              All admin actions are recorded automatically. Retention: 90 days.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void handleExportCsv()}
            disabled={exporting || logs.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </CardHeader>

        {/* Filter bar */}
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 md:flex-row md:items-center md:gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          </div>
          <Select
            value={actionFilter}
            onValueChange={(v) => setActionFilter(v as 'all' | AuditAction)}
          >
            <SelectTrigger size="sm" className="w-[200px]" aria-label="Filter by action">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <Separator className="my-1" />
              {AUDIT_ACTION_VALUES.map((a) => (
                <SelectItem key={a} value={a}>
                  {AUDIT_ACTION_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={userFilter}
            onValueChange={(v) => setUserFilter(v)}
          >
            <SelectTrigger size="sm" className="w-[200px]" aria-label="Filter by user">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <Separator className="my-1" />
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-auto"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-auto"
              aria-label="To date"
            />
          </div>
        </div>

        {/* Table */}
        {logsLoading ? (
          <LoadingState label="Loading audit log…" />
        ) : logsError ? (
          <ErrorState message={logsError} onRetry={() => void loadLogs()} />
        ) : pageLogs.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No audit logs match your filters."
            description="Try clearing filters or choosing a wider date range."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="pr-5">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageLogs.map((log) => (
                  <AuditLogRow key={log.id} log={log} />
                ))}
              </TableBody>
            </Table>
            <Separator />
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{currentLogPage}</span> of{' '}
                <span className="font-medium text-foreground">{totalLogPages}</span>
                <span className="ml-2 hidden sm:inline">
                  · {logs.length} entr{logs.length === 1 ? 'y' : 'ies'}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={currentLogPage <= 1}
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={currentLogPage >= totalLogPages}
                  onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  tone: 'primary' | 'warning';
}) {
  return (
    <Card className="aidip-hover-lift gap-0 py-4">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              tone === 'warning'
                ? 'bg-warning-subtle text-warning'
                : 'bg-primary-subtle text-primary',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          {subValue && <p className="text-[11px] text-muted-foreground">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function PeakHoursHeatmap({ grid, max }: { grid: number[][]; max: number }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[680px]">
        {/* Hour labels (X axis) */}
        <div className="mb-1 grid grid-cols-[40px_repeat(24,1fr)] gap-1">
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="text-center text-[10px] font-medium text-muted-foreground"
            >
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {/* Rows */}
        {DAYS_OF_WEEK.map((dayName, dayIdx) => (
          <div key={dayName} className="mb-1 grid grid-cols-[40px_repeat(24,1fr)] gap-1">
            <div className="flex items-center text-[11px] font-medium text-muted-foreground">
              {dayName}
            </div>
            {Array.from({ length: 24 }).map((_, h) => {
              const queries = grid[dayIdx]?.[h] ?? 0;
              const opacity = queries === 0 ? 0.04 : Math.max(0.12, queries / max);
              return (
                <div
                  key={h}
                  title={`${dayName} ${h}:00 — ${queries} queries`}
                  className="aspect-square rounded-[2px] transition-transform hover:scale-110"
                  style={{
                    backgroundColor: CHART_PRIMARY,
                    opacity,
                  }}
                />
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-muted-foreground">Less</span>
          {[0.12, 0.3, 0.5, 0.7, 1].map((o) => (
            <div
              key={o}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: CHART_PRIMARY, opacity: o }}
            />
          ))}
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ log }: { log: AuditLog }) {
  const roleLabel = labelForRole(log.userType);
  return (
    <TableRow>
      <TableCell className="pl-5 text-sm text-muted-foreground">
        {formatDateTime(log.createdAt)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary-subtle text-[10px] font-medium text-primary">
              {getInitials(log.userName || '?')}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-foreground">
            {log.userName || 'System'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {log.userType ? (
          <Badge variant={ROLE_BADGE_VARIANT[log.userType]} className="text-[10px]">
            {roleLabel}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {AUDIT_ACTION_LABEL[log.action] ?? log.action}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {log.resourceType ? (
          <span className="flex items-center gap-1">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {log.resourceType}
            </span>
            {log.resourceId && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {log.resourceId.slice(0, 8)}
              </span>
            )}
          </span>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5">
          <span
            className={cn('inline-block h-1.5 w-1.5 rounded-full', AUDIT_SEVERITY_COLOR[log.severity])}
          />
          <Badge variant={AUDIT_SEVERITY_VARIANT[log.severity]} className="text-[10px] capitalize">
            {log.severity}
          </Badge>
        </span>
      </TableCell>
      <TableCell className="pr-5 text-sm tabular-nums text-muted-foreground">
        {log.ipAddress ?? '—'}
      </TableCell>
    </TableRow>
  );
}

function labelForRole(role: UserRole): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Analyst';
}
