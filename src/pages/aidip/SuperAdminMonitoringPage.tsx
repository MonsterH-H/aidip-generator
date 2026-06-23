/**
 * AIDIP — Super Admin Monitoring Page — CDC §11 (Module 11).
 *
 * AI monitoring + incident management. Three tabs:
 *   Token Consumption · Providers · Incidents
 *
 * Incidents enforce:
 *   - Critical severity requires mandatory post-mortem on resolve
 *   - SLA countdown: critical <4h / major <24h / minor <7d
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  Loader2,
  Plus,
  Server,
  Zap,
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
  Company,
  Incident,
  IncidentSeverity,
  IncidentStatus,
} from '@/lib/aidip/types';
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_SEVERITY_SLA_HOURS,
  INCIDENT_SEVERITY_VALUES,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_VALUES,
} from '@/lib/aidip/constants';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatNumber, formatRelativeTime } from '@/lib/aidip/format';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#0078d4', '#2dd4bf', '#6366f1', '#f59e0b', '#ec4899'];

const SEVERITY_BADGE_CLASS: Record<IncidentSeverity, string> = {
  critical: 'border-destructive/30 bg-destructive-subtle text-destructive',
  major: 'border-warning/30 bg-warning-subtle text-warning',
  minor: 'border-primary/30 bg-primary-subtle text-primary',
};

const STATUS_BADGE_CLASS: Record<IncidentStatus, string> = {
  investigating: 'border-warning/30 bg-warning-subtle text-warning',
  identified: 'border-primary/30 bg-primary-subtle text-primary',
  monitoring: 'border-chart-2/30 bg-[color:var(--chart-2)]/10 text-[color:var(--chart-2)]',
  resolved: 'border-success/30 bg-success-subtle text-success',
};

function slaLabel(severity: IncidentSeverity): string {
  const h = INCIDENT_SEVERITY_SLA_HOURS[severity];
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function remainingMs(incident: Incident): number | null {
  if (incident.resolvedAt) return null;
  const slaMs = INCIDENT_SEVERITY_SLA_HOURS[incident.severity] * 3_600_000;
  const elapsed = Date.now() - new Date(incident.createdAt).getTime();
  return slaMs - elapsed;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Over SLA';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  return `${hours}h ${minutes}m left`;
}

export function SuperAdminMonitoringPage() {
  const [tab, setTab] = useState<'tokens' | 'providers' | 'incidents'>('tokens');

  return (
    <PageContainer>
      <PageHeader
        title="AI Monitoring & Incidents"
        subtitle="Track token consumption, costs, and manage platform incidents."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="tokens" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            Token Consumption
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tokens">
          <TokensTab />
        </TabsContent>
        <TabsContent value="providers">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="incidents">
          <IncidentsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Token Consumption tab
---------------------------------------------------------------------------- */

interface TokenKpi {
  totalToday: number;
  totalMonth: number;
  estimatedCostUsd: number;
  budgetUtilizationPct: number;
}

function TokensTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ServiceContainer.getInstance()
      .aidip.company.list()
      .then((items) => !cancelled && setCompanies(items.filter((c) => c.status !== 'deleted')))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive token KPIs from the company list (mock heuristic)
  const kpi: TokenKpi = useMemo(() => {
    const totalToday = companies.reduce(
      (s, c) => s + c.queriesToday * 850,
      0,
    );
    const totalMonth = totalToday * 22;
    const totalBudget = companies.reduce((s, c) => s + c.aiDailyTokenBudget, 0) || 1;
    return {
      totalToday,
      totalMonth,
      estimatedCostUsd: (totalToday / 1_000_000) * 5,
      budgetUtilizationPct: Math.min(100, Math.round((totalToday / totalBudget) * 100)),
    };
  }, [companies]);

  // Build 30-day consumption series (mock deterministic curve)
  const series = useMemo(() => {
    const out: { date: string; tokens: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const base = kpi.totalToday * (0.6 + Math.sin(i / 3) * 0.15 + (i % 7 === 0 ? 0.2 : 0));
      out.push({ date: d.toISOString().slice(0, 10), tokens: Math.max(0, Math.round(base)) });
    }
    return out;
  }, [kpi.totalToday]);

  const top10ByCost = useMemo(() => {
    return companies
      .map((c) => ({
        name: c.name,
        tokens: c.queriesToday * 850,
        cost: (c.queriesToday * 850) / 1_000_000 * 5,
        budget: c.aiDailyTokenBudget,
        usedPct: Math.min(100, Math.round(((c.queriesToday * 850) / c.aiDailyTokenBudget) * 100)),
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [companies]);

  if (loading) return <LoadingState label="Loading token consumption…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Zap} label="Tokens today" value={formatNumber(kpi.totalToday)} />
        <KpiCard icon={Cpu} label="This month" value={formatNumber(kpi.totalMonth)} />
        <KpiCard
          icon={DollarSign}
          label="Estimated cost"
          value={formatCurrency(kpi.estimatedCostUsd, 'USD')}
          subtitle="today"
        />
        <KpiCard
          icon={Activity}
          label="Budget utilization"
          value={`${kpi.budgetUtilizationPct}%`}
          tone={kpi.budgetUtilizationPct >= 90 ? 'destructive' : kpi.budgetUtilizationPct >= 70 ? 'warning' : 'success'}
        />
      </div>

      {/* 30-day consumption */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Token consumption (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="grad-tokens" x1="0" y1="0" x2="0" y2="1">
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
                formatter={(v: number) => [formatNumber(v), 'Tokens']}
              />
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="#0078d4"
                strokeWidth={2}
                fill="url(#grad-tokens)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cost by company */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Cost by company (top 10)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              layout="vertical"
              data={top10ByCost}
              margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
              />
              <RechartsTooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, 'Cost']}
                cursor={{ fill: 'rgba(0,120,212,0.06)' }}
              />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                {top10ByCost.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-company table */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">Per-company consumption</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {top10ByCost.length === 0 ? (
            <EmptyState icon={Cpu} title="No consumption data yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-5">Company</TableHead>
                  <TableHead>Tokens today</TableHead>
                  <TableHead>Tokens this month</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>% used</TableHead>
                  <TableHead className="pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top10ByCost.map((row) => {
                  const status: 'ok' | 'warning' | 'critical' =
                    row.usedPct >= 100 ? 'critical' : row.usedPct >= 80 ? 'warning' : 'ok';
                  return (
                    <TableRow key={row.name}>
                      <TableCell className="pl-5 text-sm font-medium text-foreground">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {formatNumber(row.tokens)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {formatNumber(row.tokens * 22)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatNumber(row.budget)}
                      </TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={row.usedPct}
                            className={cn(
                              'h-1.5 flex-1',
                              status === 'critical'
                                ? '[&>[data-slot=progress-indicator]]:bg-destructive'
                                : status === 'warning'
                                  ? '[&>[data-slot=progress-indicator]]:bg-warning'
                                  : '[&>[data-slot=progress-indicator]]:bg-success',
                            )}
                          />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {row.usedPct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] capitalize',
                            status === 'critical'
                              ? 'border-destructive/30 bg-destructive-subtle text-destructive'
                              : status === 'warning'
                                ? 'border-warning/30 bg-warning-subtle text-warning'
                                : 'border-success/30 bg-success-subtle text-success',
                          )}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-success-subtle text-success',
    warning: 'bg-warning-subtle text-warning',
    destructive: 'bg-destructive-subtle text-destructive',
  }[tone];
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', toneClass)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Providers tab
---------------------------------------------------------------------------- */

interface ProviderRow {
  id: string;
  name: string;
  status: 'ok' | 'down';
  endpoint: string;
  models: string[];
  dailyBudgetTokens: number;
  currentUsagePct: number;
}

const SEED_PROVIDERS: ProviderRow[] = [
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    status: 'ok',
    endpoint: 'https://aidip-prod-openai.openai.azure.com/',
    models: ['gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    dailyBudgetTokens: 5_000_000,
    currentUsagePct: 62,
  },
  {
    id: 'openai',
    name: 'OpenAI (fallback)',
    status: 'ok',
    endpoint: 'https://api.openai.com/v1/',
    models: ['gpt-4o-mini', 'gpt-4.1'],
    dailyBudgetTokens: 1_500_000,
    currentUsagePct: 8,
  },
];

function ProvidersTab() {
  const [fallbackEnabled, setFallbackEnabled] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      {/* Fallback config */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-primary" />
            Provider fallback
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              Primary: Azure OpenAI · Fallback: OpenAI
            </span>
            <span className="text-xs text-muted-foreground">
              When enabled, requests that fail on the primary provider are automatically retried on
              the fallback. Fallback usage is billed separately.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {fallbackEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Provider cards */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Configured providers</h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => toast.info('Add provider — not implemented in MVP.')}
        >
          <Plus className="h-3.5 w-3.5" />
          Add provider
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SEED_PROVIDERS.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  const ok = provider.status === 'ok';
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md',
                ok ? 'bg-success-subtle' : 'bg-destructive-subtle',
              )}
            >
              <Server className={cn('h-4 w-4', ok ? 'text-success' : 'text-destructive')} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{provider.name}</span>
              <span className="text-xs text-muted-foreground">{provider.endpoint}</span>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-[10px]',
              ok
                ? 'border-success/30 bg-success-subtle text-success'
                : 'border-destructive/30 bg-destructive-subtle text-destructive',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                ok ? 'bg-success' : 'bg-destructive',
              )}
            />
            {ok ? 'Operational' : 'Down'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {provider.models.map((m) => (
            <Badge key={m} variant="secondary" className="text-[10px] font-mono">
              {m}
            </Badge>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Daily usage</span>
            <span className="font-medium text-foreground">
              {formatNumber(
                Math.floor((provider.dailyBudgetTokens * provider.currentUsagePct) / 100),
              )}{' '}
              / {formatNumber(provider.dailyBudgetTokens)} tokens
            </span>
          </div>
          <Progress
            value={provider.currentUsagePct}
            className={cn(
              'h-1.5',
              provider.currentUsagePct >= 90
                ? '[&>[data-slot=progress-indicator]]:bg-destructive'
                : provider.currentUsagePct >= 70
                  ? '[&>[data-slot=progress-indicator]]:bg-warning'
                  : '[&>[data-slot=progress-indicator]]:bg-success',
            )}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{provider.currentUsagePct}% of daily budget</span>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info(`Edit ${provider.name} — not implemented in MVP.`)}
          >
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Incidents tab
---------------------------------------------------------------------------- */

function IncidentsTab() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null);
  const [postMortemView, setPostMortemView] = useState<Incident | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const aidip = ServiceContainer.getInstance().aidip;
      const [incs, comps] = await Promise.all([aidip.incident.list(), aidip.company.list()]);
      setIncidents(incs);
      setCompanies(comps.filter((c) => c.status !== 'deleted'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleStatusChange = async (id: string, status: IncidentStatus) => {
    if (status === 'resolved') {
      const inc = incidents.find((i) => i.id === id);
      if (inc) setResolveTarget(inc);
      return;
    }
    try {
      const updated = await ServiceContainer.getInstance().aidip.incident.updateStatus(id, status);
      setIncidents((items) => items.map((i) => (i.id === id ? updated : i)));
      toast.success(`Status updated to "${INCIDENT_STATUS_LABEL[status]}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed.');
    }
  };

  const handleResolve = async (postMortem: string) => {
    if (!resolveTarget) return;
    try {
      const updated = await ServiceContainer.getInstance().aidip.incident.resolve(
        resolveTarget.id,
        postMortem,
      );
      setIncidents((items) => items.map((i) => (i.id === resolveTarget.id ? updated : i)));
      toast.success('Incident resolved and post-mortem saved.');
      setResolveTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed.');
    }
  };

  const companyName = (id: string) =>
    companies.find((c) => c.id === id)?.name ?? 'Unknown company';

  if (loading) return <LoadingState label="Loading incidents…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {incidents.length} incident{incidents.length === 1 ? '' : 's'}
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Create incident
        </Button>
      </div>

      {incidents.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={CheckCircle2}
              title="No incidents"
              description="All systems operational. Create an incident to track an ongoing event."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {incidents.map((inc) => {
            const remaining = remainingMs(inc);
            return (
              <Card key={inc.id}>
                <CardContent className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', SEVERITY_BADGE_CLASS[inc.severity])}
                        >
                          {INCIDENT_SEVERITY_LABEL[inc.severity]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', STATUS_BADGE_CLASS[inc.status])}
                        >
                          {INCIDENT_STATUS_LABEL[inc.status]}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">{inc.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{inc.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {formatRelativeTime(inc.createdAt)}
                      </span>
                      <span>
                        SLA: <span className="font-medium text-foreground">{slaLabel(inc.severity)}</span>
                      </span>
                      {remaining !== null && (
                        <span
                          className={cn(
                            'font-medium',
                            remaining <= 0
                              ? 'text-destructive'
                              : remaining < 3_600_000
                                ? 'text-warning'
                                : 'text-foreground',
                          )}
                        >
                          {formatRemaining(remaining)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Impacted companies */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Impacted:</span>
                    {inc.impactedCompanyIds.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      inc.impactedCompanyIds.map((id) => (
                        <Badge key={id} variant="secondary" className="text-[10px]">
                          {companyName(id)}
                        </Badge>
                      ))
                    )}
                  </div>

                  {inc.resolvedAt && (
                    <div className="flex items-center gap-2 text-[11px] text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      Resolved {formatRelativeTime(inc.resolvedAt)}
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {inc.postMortem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPostMortemView(inc)}
                      >
                        View post-mortem
                      </Button>
                    )}
                    {inc.status !== 'resolved' && (
                      <>
                        <Select
                          value={inc.status}
                          onValueChange={(v) =>
                            handleStatusChange(inc.id, v as IncidentStatus)
                          }
                        >
                          <SelectTrigger size="sm" className="h-7 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INCIDENT_STATUS_VALUES.filter((s) => s !== 'resolved').map((s) => (
                              <SelectItem key={s} value={s}>
                                Set: {INCIDENT_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => setResolveTarget(inc)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateIncidentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companies={companies}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />

      <ResolveIncidentDialog
        incident={resolveTarget}
        onOpenChange={(o) => !o && setResolveTarget(null)}
        onResolve={handleResolve}
      />

      <PostMortemViewDialog
        incident={postMortemView}
        onOpenChange={(o) => !o && setPostMortemView(null)}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Create incident dialog
---------------------------------------------------------------------------- */

function CreateIncidentDialog({
  open,
  onOpenChange,
  companies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Company[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('minor');
  const [description, setDescription] = useState('');
  const [impacted, setImpacted] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTitle('');
      setSeverity('minor');
      setDescription('');
      setImpacted([]);
    }
  }, [open]);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const toggleImpacted = (id: string) => {
    setImpacted((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await ServiceContainer.getInstance().aidip.incident.create({
        title: title.trim(),
        severity,
        description: description.trim(),
        impactedCompanyIds: impacted,
      });
      toast.success('Incident created.');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Create incident</DialogTitle>
          <DialogDescription>
            Track an ongoing platform event. Admins of impacted companies will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Azure OpenAI elevated latency in West Europe"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Severity</Label>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as IncidentSeverity)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_SEVERITY_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {INCIDENT_SEVERITY_LABEL[s]} — SLA {slaLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the symptoms and impact."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Impacted companies</Label>
            <div className="max-h-44 overflow-y-auto rounded-md border border-border p-2">
              {companies.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No companies available.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {companies.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted/60">
                        <Checkbox
                          checked={impacted.includes(c.id)}
                          onCheckedChange={() => toggleImpacted(c.id)}
                        />
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="text-muted-foreground">· {c.domain ?? 'no domain'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {impacted.length} selected
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------------------
   Resolve incident dialog (post-mortem required for critical)
---------------------------------------------------------------------------- */

function ResolveIncidentDialog({
  incident,
  onOpenChange,
  onResolve,
}: {
  incident: Incident | null;
  onOpenChange: (o: boolean) => void;
  onResolve: (postMortem: string) => void;
}) {
  const [postMortem, setPostMortem] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (incident) setPostMortem('');
  }, [incident]);

  const isCritical = incident?.severity === 'critical';
  const canSubmit = postMortem.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onResolve(postMortem.trim());
    setSubmitting(false);
  };

  return (
    <Dialog open={!!incident} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Resolve incident</DialogTitle>
          <DialogDescription>
            {incident?.title}
            {isCritical && (
              <span className="mt-1 block text-destructive">
                Critical incidents require a mandatory post-mortem before resolution.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">
            Post-mortem {isCritical ? '(required)' : '(recommended)'}
          </Label>
          <Textarea
            rows={6}
            placeholder="Root cause, mitigation, action items with owners and due dates…"
            value={postMortem}
            onChange={(e) => setPostMortem(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Visible to impacted company admins once published.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Resolve incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------------------
   Post-mortem view dialog
---------------------------------------------------------------------------- */

function PostMortemViewDialog({
  incident,
  onOpenChange,
}: {
  incident: Incident | null;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={!!incident} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Post-mortem</DialogTitle>
          <DialogDescription>{incident?.title}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/40 px-3.5 py-3 text-sm text-foreground whitespace-pre-wrap">
          {incident?.postMortem ?? '—'}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
