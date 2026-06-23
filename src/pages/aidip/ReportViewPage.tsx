/**
 * AIDIP — Report view page (Module 5 / CDC §9.4).
 *
 * Read-only view of a published report. Renders each section according to its
 * type (text / chart / table / kpi / ai_insight) with live data, a freshness
 * indicator, per-section refresh, and a sticky anchor navigation bar.
 *
 * Anti-hallucination: when a section's loadStatus === 'error', the section's
 * data is not rendered — only an inline error indicator with a retry button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Copy,
  Crown,
  Download,
  Edit,
  FileText,
  Loader2,
  MoreHorizontal,
  Pin,
  RefreshCw,
  Share2,
  Sparkles,
  Table as TableIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  ChartSeriesPoint,
  ChatTableColumn,
  Report,
  ReportSection,
  ReportSectionType,
} from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import {
  REPORT_STATUS_BADGE_VARIANT,
  REPORT_STATUS_LABEL,
  REPORT_VISIBILITY_LABEL,
  REPORT_SECTION_TYPE_LABEL,
} from '@/lib/aidip/constants';
import {
  formatCurrency,
  formatFreshness,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  getInitials,
} from '@/lib/aidip/format';

import { PageContainer, ErrorState, LoadingState } from '@/components/aidip/PagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { extractPreviousSectionData } from '@/lib/aidip/sections';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareModal } from '@/components/aidip/ShareModal';
import { ExportConfigModal } from '@/components/aidip/ExportConfigModal';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#0078d4', '#2dd4bf', '#6366f1', '#f59e0b', '#ec4899', '#16a34a'];

const SECTION_ICONS: Record<ReportSectionType, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  chart: BarChart3,
  table: TableIcon,
  kpi: TrendingUp,
  ai_insight: Sparkles,
};

export function ReportViewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { role } = useAidipSession();
  const isAdmin = role === 'admin' || role === 'super_admin';

  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Sections are rendered in orderIndex order — the AI insight section uses
  // the previous section (in this sorted order) as the data context for
  // `generateInsight`.
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.orderIndex - b.orderIndex),
    [sections],
  );

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      const [r, s] = await Promise.all([
        svc.get(reportId),
        svc.listSections(reportId),
      ]);
      if (!r) {
        setError('Report not found.');
        setReport(null);
        return;
      }
      setReport(r);
      setSections(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshSection = useCallback(
    async (sectionId: string) => {
      if (!reportId) return;
      setRefreshingIds((prev) => new Set(prev).add(sectionId));
      try {
        const updated = await ServiceContainer.getInstance().aidip.report.refreshSectionData(
          reportId,
          sectionId,
        );
        setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
        toast.success('Section refreshed.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to refresh section.');
      } finally {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }
    },
    [reportId],
  );

  const refreshAll = useCallback(async () => {
    if (!reportId || sections.length === 0) return;
    setRefreshingAll(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      const results = await Promise.allSettled(
        sections.map((s) => svc.refreshSectionData(reportId, s.id)),
      );
      const updated = results
        .filter(
          (r): r is PromiseFulfilledResult<ReportSection> => r.status === 'fulfilled',
        )
        .map((r) => r.value);
      if (updated.length === sections.length) {
        setSections(updated);
        toast.success(`All ${updated.length} sections refreshed.`);
      } else {
        toast.warning(`${updated.length}/${sections.length} sections refreshed.`);
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh report.');
    } finally {
      setRefreshingAll(false);
    }
  }, [reportId, sections, load]);

  const handleDuplicate = async () => {
    if (!report) return;
    try {
      const copy = await ServiceContainer.getInstance().aidip.report.duplicate(report.id);
      toast.success(`Duplicated as “${copy.title}”.`);
      navigate(`/reports/${copy.id}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate report.');
    }
  };

  const handleArchive = async () => {
    if (!report) return;
    if (!confirm(`Archive “${report.title}”? It will be hidden from the reports list.`)) return;
    try {
      await ServiceContainer.getInstance().aidip.report.archive(report.id);
      toast.success('Report archived.');
      navigate('/reports');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to archive report.');
    }
  };

  const handlePinOfficial = async () => {
    if (!report) return;
    try {
      const updated = await ServiceContainer.getInstance().aidip.report.pinOfficial(
        report.id,
        !report.isOfficial,
      );
      setReport(updated);
      toast.success(updated.isOfficial ? 'Pinned as Official.' : 'Removed Official pin.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update Official status.');
    }
  };

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading && !report) {
    return (
      <PageContainer>
        <LoadingState label="Loading report…" />
      </PageContainer>
    );
  }

  if (error || !report) {
    return (
      <PageContainer>
        <ErrorState message={error ?? 'Report not found.'} onRetry={load} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-[var(--content-max-width)]">
      {/* ===================== Header ===================== */}
      <div className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={REPORT_STATUS_BADGE_VARIANT[report.status]} className="text-[10px]">
                {REPORT_STATUS_LABEL[report.status]}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">
                {REPORT_VISIBILITY_LABEL[report.visibility]}
              </Badge>
              {report.isOfficial && (
                <Badge className="gap-1 bg-warning text-warning-foreground text-[10px] hover:bg-warning">
                  <Crown className="h-2.5 w-2.5" /> Official
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {report.title}
            </h1>
            {report.description && (
              <p className="text-sm text-muted-foreground">{report.description}</p>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="size-5">
                <AvatarFallback className="bg-primary-subtle text-[9px] font-medium text-primary">
                  {getInitials(report.ownerName)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground">{report.ownerName}</span>
              <span>·</span>
              <span>Updated {formatRelativeTime(report.updatedAt)}</span>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void refreshAll()}
              disabled={refreshingAll || sections.length === 0}
            >
              {refreshingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`/reports/${report.id}/edit`}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setExportOpen(true)}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Report actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => void handleDuplicate()}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleArchive()}>
                  <Archive className="h-3.5 w-3.5" /> Archive
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => void handlePinOfficial()}>
                    <Pin className="h-3.5 w-3.5" />
                    {report.isOfficial ? 'Unpin Official' : 'Pin Official'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/reports">
                    <FileText className="h-3.5 w-3.5" /> Back to reports
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ===================== Anchor navigation ===================== */}
      {sections.length > 0 && (
        <div className="sticky top-[var(--header-height)] z-20 mb-4 -mx-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sections
            </span>
            {sections.map((s, i) => {
              const Icon = SECTION_ICONS[s.type] ?? FileText;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="group flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-primary-subtle hover:text-primary"
                >
                  <span className="text-[10px] tabular-nums">{i + 1}</span>
                  <Icon className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== Body ===================== */}
      {sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">This report has no sections yet.</p>
            <p className="text-xs text-muted-foreground">
              Add text, charts, KPIs, tables, and AI insights in the editor.
            </p>
            <Button asChild size="sm" className="mt-2 gap-1.5">
              <Link to={`/reports/${report.id}/edit`}>
                <Edit className="h-3.5 w-3.5" /> Edit report
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {sortedSections.map((section, idx) => (
            <SectionView
              key={section.id}
              section={section}
              index={idx}
              previousSection={idx > 0 ? sortedSections[idx - 1] ?? null : null}
              refreshing={refreshingIds.has(section.id)}
              onRefresh={() => void refreshSection(section.id)}
              registerRef={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
                else sectionRefs.current.delete(section.id);
              }}
            />
          ))}
        </div>
      )}

      {/* ===================== Modals ===================== */}
      <ShareModal
        reportId={report.id}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <ExportConfigModal
        reportId={report.id}
        reportTitle={report.title}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Section wrapper
---------------------------------------------------------------------------- */

function SectionView({
  section,
  index,
  previousSection,
  refreshing,
  onRefresh,
  registerRef,
}: {
  section: ReportSection;
  index: number;
  previousSection: ReportSection | null;
  refreshing: boolean;
  onRefresh: () => void;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const Icon = SECTION_ICONS[section.type] ?? FileText;
  const hasError = section.loadStatus === 'error';

  return (
    <Card
      ref={registerRef as unknown as React.Ref<HTMLDivElement>}
      className="scroll-mt-[calc(var(--header-height)+60px)] py-0"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border py-3 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex min-w-0 flex-col">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <span className="truncate">{section.title}</span>
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {REPORT_SECTION_TYPE_LABEL[section.type]}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-50"
          title={formatFreshness(section.freshness)}
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span>{formatFreshness(section.freshness)}</span>
        </button>
      </CardHeader>
      <CardContent className="pt-4">
        {hasError ? (
          <SectionError onRetry={onRefresh} />
        ) : refreshing ? (
          <SectionRefreshing />
        ) : (
          <SectionBody section={section} previousSection={previousSection} />
        )}
      </CardContent>
    </Card>
  );
}

function SectionBody({
  section,
  previousSection,
}: {
  section: ReportSection;
  previousSection: ReportSection | null;
}) {
  switch (section.type) {
    case 'text':
      return <TextSection section={section} />;
    case 'chart':
      return <ChartSection section={section} />;
    case 'table':
      return <TableSection section={section} />;
    case 'kpi':
      return <KpiSection section={section} />;
    case 'ai_insight':
      return <AiInsightSection section={section} previousSection={previousSection} />;
    default:
      return null;
  }
}

function SectionRefreshing() {
  return (
    <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing live data…
    </div>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-destructive/30 bg-destructive-subtle px-4 py-6 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="text-sm font-medium text-destructive">Failed to load section data.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The underlying query could not be executed. Try refreshing — if the problem persists, contact your admin.
      </p>
      <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Section type renderers
---------------------------------------------------------------------------- */

function TextSection({ section }: { section: ReportSection }) {
  const content = section.configuration.text?.content ?? '';
  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
      <MarkdownLite text={content} />
    </div>
  );
}

/** Minimal markdown: paragraphs, **bold**, lists, line breaks. */
function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        // Bullet list block
        if (trimmed.split('\n').every((l) => /^\s*[-*]\s+/.test(l))) {
          const items = trimmed.split('\n').map((l) => l.replace(/^\s*[-*]\s+/, ''));
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5">
              {items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        // Numbered list block
        if (trimmed.split('\n').every((l) => /^\s*\d+\.\s+/.test(l))) {
          const items = trimmed.split('\n').map((l) => l.replace(/^\s*\d+\.\s+/, ''));
          return (
            <ol key={i} className="my-2 list-decimal space-y-1 pl-5">
              {items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="my-2">
            {trimmed.split('\n').map((line, j) => (
              <span key={j}>
                {renderInline(line)}
                {j < trimmed.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ChartSection({ section }: { section: ReportSection }) {
  const cfg = section.configuration.chart;
  const series: ChartSeriesPoint[] = cfg?.series ?? [];
  const chartType = cfg?.chartType ?? 'bar';
  const title = cfg?.title ?? section.title;
  const source = cfg?.source;

  if (series.length === 0) {
    return <p className="text-xs text-muted-foreground">No data points configured.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {source && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-1 w-1 rounded-full bg-success" />
            {source}
          </span>
        )}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0078d4"
                strokeWidth={2}
                dot={{ r: 3, fill: '#0078d4' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0078d4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0078d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0078d4"
                strokeWidth={2}
                fill="url(#area-fill)"
              />
            </AreaChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={series}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={40}
                label={({ name, percent }) =>
                  `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {series.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : (
            <BarChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {series.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableSection({ section }: { section: ReportSection }) {
  const cfg = section.configuration.table;
  const columns: ChatTableColumn[] = cfg?.columns ?? [];
  const rows: Record<string, string | number>[] = cfg?.rows ?? [];

  if (columns.length === 0 || rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No table data configured.</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-muted/60 hover:bg-surface-muted/60">
            {columns.map((c) => (
              <TableHead key={c.key} className="text-xs">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key} className="text-xs">
                  {formatCell(row[c.key], c.format)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatCell(value: string | number | undefined, format?: ChatTableColumn['format']): string {
  if (value === undefined || value === null) return '—';
  if (format === 'currency') {
    return typeof value === 'number' ? formatCurrency(value) : String(value);
  }
  if (format === 'percent') {
    return typeof value === 'number' ? formatPercent(value) : String(value);
  }
  if (format === 'integer') {
    return typeof value === 'number' ? formatNumber(value) : String(value);
  }
  return String(value);
}

function KpiSection({ section }: { section: ReportSection }) {
  const kpi = section.configuration.kpi;
  if (!kpi) return <p className="text-xs text-muted-foreground">No KPI configured.</p>;

  const valueStr =
    kpi.format === 'currency'
      ? formatCurrency(kpi.value)
      : kpi.format === 'percent'
        ? `${kpi.value.toFixed(1)}%`
        : formatNumber(kpi.value);

  const comparison = kpi.comparison;
  const trendUp = comparison ? comparison.value >= 0 : null;
  const TrendIcon = trendUp === null ? null : trendUp ? TrendingUp : TrendingDown;

  // Threshold-based color (warning/critical are negative-change thresholds)
  let trendColor = 'text-success';
  if (comparison) {
    if (kpi.thresholds?.critical !== undefined && comparison.value <= kpi.thresholds.critical) {
      trendColor = 'text-destructive';
    } else if (kpi.thresholds?.warning !== undefined && comparison.value <= kpi.thresholds.warning) {
      trendColor = 'text-warning';
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </span>
        <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
          {valueStr}
        </span>
        {comparison && (
          <div className="flex items-center gap-1.5 text-xs">
            {TrendIcon && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
            <span className={cn('font-medium', trendColor)}>
              {formatPercent(comparison.value)}
            </span>
            <span className="text-muted-foreground">{comparison.label}</span>
          </div>
        )}
      </div>
      <Separator orientation="vertical" className="hidden h-12 sm:block" />
      {section.dabQuery && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-block h-1 w-1 rounded-full bg-success" />
          Live query result
        </div>
      )}
    </div>
  );
}

function AiInsightSection({
  section,
  previousSection,
}: {
  section: ReportSection;
  previousSection: ReportSection | null;
}) {
  const cfg = section.configuration.aiInsight;
  const prompt = cfg?.prompt ?? '';
  const length = cfg?.length ?? 'medium';

  const [bullets, setBullets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const previousSectionData = useMemo(
    () => extractPreviousSectionData(previousSection),
    [previousSection],
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ServiceContainer.getInstance().aidip.chat.generateInsight({
        prompt,
        length,
        previousSectionData,
      });
      if (result.ok) {
        setBullets(result.bullets);
      } else {
        setBullets([]);
        setError(result.errorMessage ?? 'Failed to generate insights.');
      }
    } catch (err) {
      setBullets([]);
      setError(err instanceof Error ? err.message : 'Failed to generate insights.');
    } finally {
      setLoading(false);
    }
  }, [prompt, length, previousSectionData]);

  useEffect(() => {
    void generate();
  }, [generate]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/20 bg-gradient-to-br from-primary-subtle/60 to-surface-muted p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">AI Insight</span>
            <span className="text-[10px] text-muted-foreground">
              Generated · {length} length
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px]"
          onClick={() => void generate()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Regenerate
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="mt-1.5 h-1 w-1 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Generating AI insights…
          </p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      ) : bullets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No insights were generated. Try regenerating or refining the prompt.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <AlertTriangle className="h-2.5 w-2.5" />
        AI-generated — verify against source data before acting.
      </p>
    </div>
  );
}
