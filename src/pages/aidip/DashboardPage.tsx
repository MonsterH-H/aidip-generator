/**
 * AIDIP Dashboard — Module 4 (CDC §7).
 *
 * Post-login homepage for analysts and admins. Shows live KPIs, recent
 * activity, official reports, quick actions, and a time-aware welcome
 * banner. Admins additionally see a Team Overview section.
 *
 * Premium enterprise styling inspired by Azure Portal / Microsoft Fabric /
 * Vercel / Stripe dashboards.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Crown,
  FileText,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Clock,
  Download,
  Share2,
  type LucideIcon,
} from 'lucide-react';

import type { DashboardData, KpiCard, RecentActivityItem, Report } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';

import {
  PageContainer,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatNumber, formatPercent, formatRelativeTime, greetingPrefix, quotaWarningLevel } from '@/lib/aidip/format';

// Use FileText as a fallback for the 'inventory' icon type (Lucide doesn't export Package in our import list)
const Package = FileText;

const KPI_ICONS: Record<KpiCard['icon'], LucideIcon> = {
  revenue: TrendingUp,
  inventory: Package,
  customers: Users,
  growth: Sparkles,
  queries: MessageSquare,
  users: Users,
  reports: FileText,
  uptime: Clock,
};

export function DashboardPage() {
  const { user, role } = useAidipSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.analytics;
      const d = await svc.getDashboardData();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Auto-refresh every 5 minutes (CDC §7)
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) {
    return (
      <PageContainer>
        <LoadingState label="Loading your dashboard…" />
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

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const quotaLevel = quotaWarningLevel(data.quota.used, data.quota.total);

  return (
    <PageContainer>
      {/* ====================== Welcome banner ====================== */}
      <div className="relative mb-6 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary-subtle via-card to-card p-5 shadow-sm md:p-6">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-primary-subtle-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {greetingPrefix()}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Here's what's happening with your data today.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            {quotaLevel !== 'ok' && (
              <div
                className={[
                  'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium',
                  quotaLevel === 'critical'
                    ? 'border-destructive/30 bg-destructive-subtle text-destructive'
                    : 'border-warning/30 bg-warning-subtle text-warning',
                ].join(' ')}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {quotaLevel === 'critical'
                  ? `Daily quota reached — ${data.quota.used}/${data.quota.total} queries used.`
                  : `80% of daily quota used — ${data.quota.used}/${data.quota.total} queries.`}
              </div>
            )}
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/chat?new=true">
                <Plus className="h-4 w-4" />
                Start a new conversation
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
        {/* Decorative gradient blob */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      </div>

      {/* ====================== KPI cards ====================== */}
      {data.kpis.length === 0 ? (
        <Card className="mb-6">
          <CardContent className="p-0">
            <EmptyState
              icon={TrendingUp}
              title="No KPIs configured yet"
              description="Your admin can configure KPI cards from the Admin Settings page to surface key metrics here."
              action={
                role === 'admin' ? (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to="/admin/settings"><TrendingUp className="h-4 w-4" /> Configure KPIs</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.kpis.map((kpi) => (
            <KpiCardView key={kpi.id} kpi={kpi} />
          ))}
        </div>
      )}

      {/* ====================== Quick actions ====================== */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/chat?new=true"><MessageSquare className="h-4 w-4" /> New Chat</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/reports/new"><Plus className="h-4 w-4" /> New Report</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/reports"><FileText className="h-4 w-4" /> My Reports</Link>
        </Button>
        {role === 'admin' && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/admin/team"><Users className="h-4 w-4" /> Manage Team</Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* ====================== Two-column: Recent + Official ====================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent activity — 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link to="/chat">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No recent activity"
                description="Your recent conversations, reports, and exports will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.recentActivity.map((item) => (
                  <ActivityItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Official reports — 1 col */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Crown className="h-3.5 w-3.5 text-warning" /> Official Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.officialReports.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No official reports yet"
                description="Reports your admin pins as Official will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.officialReports.slice(0, 5).map((r) => (
                  <OfficialReportItem key={r.id} report={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ====================== Admin extras ====================== */}
      {role === 'admin' && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="sm:col-span-1">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-sm">Team Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active users today</span>
                <span className="font-semibold">4 / 6</span>
              </div>
              <Separator className="my-2.5" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pending invitations</span>
                <span className="font-semibold">2</span>
              </div>
              <Separator className="my-2.5" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quota used</span>
                <span className="font-semibold">{data.quota.used} / {data.quota.total}</span>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link to="/admin/analytics">View team analytics <ArrowRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function KpiCardView({ kpi }: { kpi: KpiCard }) {
  const Icon = KPI_ICONS[kpi.icon] ?? TrendingUp;
  const trendUp = kpi.comparison ? kpi.comparison.value >= 0 : null;
  // For churn / cost-type metrics, "down is good" — invert color logic
  const invertTrend = kpi.title.toLowerCase().includes('churn') || kpi.title.toLowerCase().includes('cost');
  const positiveColor = invertTrend
    ? trendUp
      ? 'text-destructive'
      : 'text-success'
    : trendUp
      ? 'text-success'
      : 'text-destructive';

  const formatted = formatKpiValue(kpi);
  const TrendIcon = trendUp ? ArrowUpRight : ArrowDownRight;

  return (
    <Link
      to={`/chat?new=true&q=${encodeURIComponent(`What's the trend for ${kpi.title}?`)}`}
      className="group block"
    >
      <Card className="aidip-hover-lift cursor-pointer overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-subtle">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{kpi.title}</span>
          </div>
          {kpi.comparison && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${positiveColor}`}>
              <TrendIcon className="h-3 w-3" />
              {formatPercent(kpi.comparison.value)}
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground">{formatted}</div>
              {kpi.comparison && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{kpi.comparison.label}</div>
              )}
            </div>
            {/* Sparkline */}
            <Sparkline points={kpi.sparkline} positive={trendUp ?? true} />
          </div>
          {kpi.source && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-1 w-1 rounded-full bg-success" />
              {kpi.source}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function formatKpiValue(kpi: KpiCard): string {
  if (kpi.valueType === 'amount') return formatCurrency(kpi.value, kpi.format);
  if (kpi.valueType === 'percentage') return `${kpi.value.toFixed(1)}%`;
  return formatNumber(kpi.value);
}

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const step = w / (points.length - 1);
  const color = positive ? 'var(--success)' : 'var(--destructive)';
  const fill = positive ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)';

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - ((p - min) / range) * h}`).join(' ');
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <path d={fillPath} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityItem({ item }: { item: RecentActivityItem }) {
  const Icon = ACTIVITY_ICONS[item.type];
  return (
    <li>
      <Link
        to={item.actionUrl}
        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatRelativeTime(item.timestamp)}
        </span>
      </Link>
    </li>
  );
}

const ACTIVITY_ICONS: Record<RecentActivityItem['type'], LucideIcon> = {
  conversation: MessageSquare,
  report_modified: FileText,
  export_ready: Download,
  report_shared: Share2,
};

function OfficialReportItem({ report: r }: { report: Report }) {
  return (
    <li>
      <Link
        to={`/reports/${r.id}`}
        className="flex flex-col gap-1 px-5 py-3 hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Crown className="h-3 w-3 shrink-0 text-warning" />
          <span className="truncate text-sm font-medium text-foreground">{r.title}</span>
        </div>
        <div className="flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
          <span>by {r.ownerName}</span>
          <span>·</span>
          <span>{formatRelativeTime(r.updatedAt)}</span>
        </div>
      </Link>
    </li>
  );
}
