/**
 * AIDIP — Super Admin Platform Dashboard — CDC §11 (Module 11).
 *
 * Platform-wide overview visible only to super_admins (HESYD operators).
 * Aggregated metrics across all tenants — never client business data.
 *
 * Layout:
 *   - PageHeader + refresh action
 *   - 6 KPI cards (active companies, users, AI queries today/month,
 *     uptime %, aggregated token cost USD)
 *   - Charts row: company evolution (area), top-10 query distribution
 *     (horizontal bar), uptime 30d (line with green/yellow/red zones)
 *   - Active alerts card (severity-coded list)
 *   - Recent platform incidents card → links to /super-admin/monitoring
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Incident, PlatformAnalytics, PlatformAlert } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';

import {
  PageContainer,
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/aidip/PagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
} from '@/lib/aidip/format';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#0078d4', '#2dd4bf', '#6366f1', '#f59e0b', '#ec4899'];

export function SuperAdminDashboardPage() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const aidip = ServiceContainer.getInstance().aidip;
      const [pa, incs] = await Promise.all([
        aidip.analytics.getPlatformAnalytics(),
        aidip.incident.list(),
      ]);
      setData(pa);
      setIncidents(incs.slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load platform dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) {
    return (
      <PageContainer>
        <LoadingState label="Loading platform dashboard…" />
      </PageContainer>
    );
  }

  if (error && !data) {
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={load} />
      </PageContainer>
    );
  }

  if (!data) return null;

  return (
    <PageContainer>
      <PageHeader
        title="Platform Dashboard"
        subtitle="Monitor all tenants, AI consumption, and platform health."
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* ====================== KPI cards ====================== */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Building2}
          label="Active companies"
          value={formatNumber(data.activeCompanies)}
          tone="primary"
        />
        <KpiCard
          icon={Users}
          label="Total users"
          value={formatNumber(data.totalUsers)}
          tone="neutral"
        />
        <KpiCard
          icon={MessageSquare}
          label="AI queries today"
          value={formatNumber(data.aiQueriesToday)}
          tone="neutral"
        />
        <KpiCard
          icon={TrendingUp}
          label="AI queries this month"
          value={formatNumber(data.aiQueriesThisMonth)}
          tone="neutral"
        />
        <KpiCard
          icon={Activity}
          label="Platform uptime"
          value={`${data.uptimePercent.toFixed(2)}%`}
          tone={data.uptimePercent >= 99.9 ? 'success' : 'warning'}
        />
        <KpiCard
          icon={DollarSign}
          label="Aggregated token cost"
          value={formatCurrency(data.aggregatedTokenCostUsd, 'USD')}
          tone="neutral"
          subtitle="this month"
        />
      </div>

      {/* ====================== Charts row ====================== */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Company evolution — area chart */}
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-primary" />
              Company evolution (6 months)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.companyEvolution6m} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="grad-companies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0078d4" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0078d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                  }}
                  formatter={(v: number) => [formatNumber(v), 'Companies']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#0078d4"
                  strokeWidth={2}
                  fill="url(#grad-companies)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Query distribution top 10 — horizontal bar */}
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary" />
              Query distribution — top 10 companies
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                layout="vertical"
                data={data.queryDistributionTop10}
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
                  dataKey="companyName"
                  width={120}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                  }}
                  formatter={(v: number) => [formatNumber(v), 'Queries today']}
                  cursor={{ fill: 'rgba(0,120,212,0.06)' }}
                />
                <Bar dataKey="queries" radius={[0, 4, 4, 0]}>
                  {data.queryDistributionTop10.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Uptime full width */}
      <Card className="mb-6">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-success" />
            Uptime (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.uptime30d} margin={{ top: 4, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[99, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, 'Uptime']}
              />
              {/* SLA zones */}
              <ReferenceLine y={99.9} stroke="#16a34a" strokeDasharray="4 4" />
              <ReferenceLine y={99.5} stroke="#d97706" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="uptime"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-success/40" /> SLA target: 99.9%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-warning/40" /> Warning: 99.5%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-destructive/40" /> Below 99.5%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ====================== Alerts + recent incidents ====================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Active alerts
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {data.activeAlerts.length}
              </Badge>
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link to="/super-admin/monitoring">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.activeAlerts.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No active alerts"
                description="All platform systems are operating normally."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.activeAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-primary" />
              Recent platform incidents
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link to="/super-admin/monitoring">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No recent incidents"
                description="Platform has been stable over the past 30 days."
              />
            ) : (
              <ul className="divide-y divide-border">
                {incidents.map((inc) => (
                  <IncidentRow key={inc.id} incident={inc} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

const TONE_CLASSES: Record<'primary' | 'neutral' | 'success' | 'warning' | 'destructive', string> = {
  primary: 'bg-primary-subtle text-primary',
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  destructive: 'bg-destructive-subtle text-destructive',
};

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle?: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card className="aidip-hover-lift">
      <CardContent className="flex flex-col gap-2 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              TONE_CLASSES[tone],
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function severityMeta(s: PlatformAlert['severity']): {
  label: string;
  className: string;
  dot: string;
} {
  switch (s) {
    case 'critical':
      return {
        label: 'Critical',
        className: 'border-destructive/30 bg-destructive-subtle text-destructive',
        dot: 'bg-destructive',
      };
    case 'major':
      return {
        label: 'Major',
        className: 'border-warning/30 bg-warning-subtle text-warning',
        dot: 'bg-warning',
      };
    case 'minor':
      return {
        label: 'Minor',
        className: 'border-primary/30 bg-primary-subtle text-primary',
        dot: 'bg-primary',
      };
  }
}

function AlertRow({ alert }: { alert: PlatformAlert }) {
  const meta = severityMeta(alert.severity);
  return (
    <li>
      <div className="flex items-start gap-3 px-5 py-3.5">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', meta.dot)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{alert.title}</span>
            <Badge variant="outline" className={cn('text-[10px]', meta.className)}>
              {meta.label}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{alert.description}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(alert.createdAt)}</span>
            <Separator orientation="vertical" className="h-3" />
            <span>
              {alert.impactedCompanyIds.length} impacted compan
              {alert.impactedCompanyIds.length === 1 ? 'y' : 'ies'}
            </span>
            <Link
              to="/super-admin/monitoring"
              className="ml-auto flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              View <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const meta = severityMeta(incident.severity);
  return (
    <li>
      <Link
        to="/super-admin/monitoring"
        className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/50"
      >
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', meta.dot)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{incident.title}</span>
            <Badge variant="outline" className={cn('text-[10px]', meta.className)}>
              {meta.label}
            </Badge>
            <Badge
              variant={incident.status === 'resolved' ? 'secondary' : 'outline'}
              className="text-[10px] capitalize"
            >
              {incident.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Created {formatRelativeTime(incident.createdAt)}</span>
            {incident.resolvedAt && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span className="text-success">Resolved {formatRelativeTime(incident.resolvedAt)}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
