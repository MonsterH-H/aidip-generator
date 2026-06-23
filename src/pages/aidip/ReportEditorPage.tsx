/**
 * AIDIP — Report editor page (Module 5 / CDC §9.6).
 *
 * 3-column editor: section tree (left) · section editor + preview (center) ·
 * report & section properties (right). Auto-saves dirty changes with an
 * 800ms debounce and a 30s safety flush. Honours the 20-section limit and
 * enforces admin-only gating for "Company" visibility and "Pin Official".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Table as TableIcon,
  Trash2,
  TrendingUp,
  X,
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
  ChartType,
  ChatTableColumn,
  Report,
  ReportSection,
  ReportSectionConfig,
  ReportSectionType,
  ReportVisibility,
} from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import {
  MAX_REPORT_SECTIONS,
  REPORT_SECTION_TYPE_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_VISIBILITY_LABEL,
} from '@/lib/aidip/constants';
import {
  formatCurrency,
  formatFreshness,
  formatNumber,
  formatPercent,
} from '@/lib/aidip/format';

import { PageContainer, LoadingState, ErrorState } from '@/components/aidip/PagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareModal } from '@/components/aidip/ShareModal';
import { cn } from '@/lib/utils';
import { extractPreviousSectionData } from '@/lib/aidip/sections';

const CHART_COLORS = ['#0078d4', '#2dd4bf', '#6366f1', '#f59e0b', '#ec4899', '#16a34a'];

const SECTION_TYPE_OPTIONS: Array<{ value: ReportSectionType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
  { value: 'kpi', label: 'KPI' },
  { value: 'ai_insight', label: 'AI Insight' },
];

const SECTION_ICONS: Record<ReportSectionType, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  chart: BarChart3,
  table: TableIcon,
  kpi: TrendingUp,
  ai_insight: Sparkles,
};

const CHART_TYPE_OPTIONS: ChartType[] = ['line', 'bar', 'pie', 'area'];

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export function ReportEditorPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { role } = useAidipSession();
  const isAdmin = role === 'admin' || role === 'super_admin';

  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Auto-save state — drafts live in refs so the timer always sees the latest
  const reportDraftRef = useRef<Partial<Report> | null>(null);
  const sectionDraftsRef = useRef<Map<string, Partial<ReportSection>>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const reportRef = useRef<Report | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      const [r, s] = await Promise.all([svc.get(reportId), svc.listSections(reportId)]);
      if (!r) {
        setError('Report not found.');
        setReport(null);
        return;
      }
      setReport(r);
      setSections(s);
      if (s.length > 0 && !selectedId) setSelectedId(s[0]!.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* -------------------------------------------------------------------------
     Auto-save plumbing
  ------------------------------------------------------------------------- */

  const flush = useCallback(async () => {
    const r = reportRef.current;
    if (!r) return;
    const reportDraft = reportDraftRef.current;
    const sectionDrafts = new Map(sectionDraftsRef.current);
    if (!reportDraft && sectionDrafts.size === 0) return;

    setSaveState('saving');
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      if (reportDraft) {
        // Translate the loose Partial<Report> draft into the service's
        // accepted patch shape (null description → undefined).
        const patch: Parameters<typeof svc.update>[1] = {};
        if (reportDraft.title !== undefined) patch.title = reportDraft.title;
        if (reportDraft.description !== undefined)
          patch.description = reportDraft.description ?? undefined;
        if (reportDraft.tags !== undefined) patch.tags = reportDraft.tags;
        if (reportDraft.visibility !== undefined) patch.visibility = reportDraft.visibility;
        if (reportDraft.status !== undefined) patch.status = reportDraft.status;
        const updated = await svc.update(r.id, patch);
        setReport(updated);
        reportRef.current = updated;
        reportDraftRef.current = null;
      }
      for (const [sectionId, patch] of sectionDrafts) {
        const updatedSec = await svc.updateSection(r.id, sectionId, patch);
        setSections((prev) => prev.map((s) => (s.id === sectionId ? updatedSec : s)));
        sectionDraftsRef.current.delete(sectionId);
      }
      setSaveState('saved');
    } catch (e) {
      console.error('Auto-save failed:', e);
      setSaveState('error');
      toast.error('Auto-save failed. Click Save to retry.');
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => void flush(), 800);
  }, [flush]);

  // Periodic safety flush every 30s
  useEffect(() => {
    const id = window.setInterval(() => {
      if (reportDraftRef.current || sectionDraftsRef.current.size > 0) {
        void flush();
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [flush]);

  // Cleanup pending flush on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, []);

  const markReportDirty = useCallback(
    (patch: Partial<Report>) => {
      reportDraftRef.current = { ...reportDraftRef.current, ...patch };
      setSaveState('unsaved');
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const markSectionDirty = useCallback(
    (id: string, patch: Partial<ReportSection>) => {
      const cur = sectionDraftsRef.current.get(id) ?? {};
      sectionDraftsRef.current.set(id, { ...cur, ...patch });
      setSaveState('unsaved');
      scheduleFlush();
    },
    [scheduleFlush],
  );

  /* -------------------------------------------------------------------------
     Report-level actions
  ------------------------------------------------------------------------- */

  const handlePublish = async () => {
    if (!report) return;
    // Validation: title required + at least one section + no empty sections
    const title = (reportDraftRef.current?.title ?? report.title).trim();
    if (!title) {
      toast.error('A title is required before publishing.');
      return;
    }
    if (sections.length === 0) {
      toast.error('Add at least one section before publishing.');
      return;
    }
    const emptySection = sections.find((s) => isSectionEmpty(s));
    if (emptySection) {
      toast.error(`Section “${emptySection.title}” is empty. Configure it before publishing.`);
      setSelectedId(emptySection.id);
      return;
    }
    setPublishing(true);
    try {
      // Flush first
      await flush();
      const updated = await ServiceContainer.getInstance().aidip.report.publish(report.id);
      setReport(updated);
      toast.success('Report published.');
      navigate(`/reports/${updated.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to publish report.');
    } finally {
      setPublishing(false);
    }
  };

  const handleExit = async () => {
    // Flush before exiting
    await flush();
    if (reportRef.current) {
      navigate(`/reports/${reportRef.current.id}`);
    } else {
      navigate('/reports');
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

  /* -------------------------------------------------------------------------
     Section-level actions
  ------------------------------------------------------------------------- */

  const handleAddSection = async (type: ReportSectionType) => {
    if (!report) return;
    if (sections.length >= MAX_REPORT_SECTIONS) {
      toast.error(`Maximum section limit reached (${MAX_REPORT_SECTIONS}).`);
      return;
    }
    try {
      const label = REPORT_SECTION_TYPE_LABEL[type];
      const s = await ServiceContainer.getInstance().aidip.report.addSection(report.id, {
        type,
        title: `New ${label} section`,
      });
      setSections((prev) => [...prev, s]);
      setSelectedId(s.id);
      toast.success(`${label} section added.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add section.');
    }
  };

  const handleDuplicateSection = async (section: ReportSection) => {
    if (!report) return;
    if (sections.length >= MAX_REPORT_SECTIONS) {
      toast.error(`Maximum section limit reached (${MAX_REPORT_SECTIONS}).`);
      return;
    }
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      const dup = await svc.addSection(report.id, {
        type: section.type,
        title: `${section.title} (copy)`,
      });
      const updated = await svc.updateSection(report.id, dup.id, {
        configuration: section.configuration,
      });
      // Insert right after the source
      const idx = sections.findIndex((s) => s.id === section.id);
      setSections((prev) => {
        const next = [...prev];
        next.splice(idx + 1, 0, updated);
        // Re-normalize orderIndex
        return next.map((s, i) => ({ ...s, orderIndex: i }));
      });
      setSelectedId(updated.id);
      toast.success('Section duplicated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate section.');
    }
  };

  const handleDeleteSection = async (section: ReportSection) => {
    if (!report) return;
    if (!confirm(`Delete section “${section.title}”? This cannot be undone.`)) return;
    try {
      await ServiceContainer.getInstance().aidip.report.removeSection(report.id, section.id);
      setSections((prev) => {
        const next = prev.filter((s) => s.id !== section.id);
        if (selectedId === section.id) {
          setSelectedId(next[0]?.id ?? null);
        }
        return next;
      });
      sectionDraftsRef.current.delete(section.id);
      toast.success('Section deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete section.');
    }
  };

  const handleReorder = async (section: ReportSection, direction: 'up' | 'down') => {
    if (!report) return;
    const idx = sections.findIndex((s) => s.id === section.id);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const next = [...sections];
    [next[idx], next[newIdx]] = [next[newIdx]!, next[idx]!];
    const normalized = next.map((s, i) => ({ ...s, orderIndex: i }));
    setSections(normalized);
    try {
      await ServiceContainer.getInstance().aidip.report.reorderSections(
        report.id,
        normalized.map((s) => s.id),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder sections.');
      await load();
    }
  };

  const handleRefreshSection = async (section: ReportSection) => {
    if (!report) return;
    try {
      const updated = await ServiceContainer.getInstance().aidip.report.refreshSectionData(
        report.id,
        section.id,
      );
      setSections((prev) => prev.map((s) => (s.id === section.id ? updated : s)));
      toast.success('Section data refreshed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh section.');
    }
  };

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId],
  );

  // Sections are rendered / analyzed in orderIndex order — the AI insight
  // editor uses the previous section (in this sorted order) as the data
  // context for `generateInsight`.
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.orderIndex - b.orderIndex),
    [sections],
  );

  const previousSectionForSelected = useMemo(() => {
    if (!selectedSection) return null;
    const idx = sortedSections.findIndex((s) => s.id === selectedSection.id);
    if (idx <= 0) return null;
    return sortedSections[idx - 1] ?? null;
  }, [selectedSection, sortedSections]);

  /* -------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------- */

  if (loading && !report) {
    return (
      <PageContainer fullWidth>
        <LoadingState label="Loading editor…" />
      </PageContainer>
    );
  }
  if (error || !report) {
    return (
      <PageContainer fullWidth>
        <ErrorState message={error ?? 'Report not found.'} onRetry={load} />
      </PageContainer>
    );
  }

  const atSectionLimit = sections.length >= MAX_REPORT_SECTIONS;

  return (
    <PageContainer fullWidth className="flex h-full flex-col px-0 py-0">
      {/* ===================== Editor header ===================== */}
      <div className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/reports">
              <X className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <input
            type="text"
            value={reportDraftRef.current?.title ?? report.title}
            onChange={(e) => markReportDirty({ title: e.target.value })}
            placeholder="Untitled report"
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-lg font-semibold text-foreground hover:border-border focus:border-border focus:bg-surface-muted focus:outline-none"
          />
          <SaveIndicator state={saveState} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={previewMode ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setPreviewMode((p) => !p)}
          >
            <Eye className="h-3.5 w-3.5" />
            {previewMode ? 'Editing' : 'Preview'}
          </Button>
          {report.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handlePublish()}
              disabled={publishing}
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => void flush()}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleExit()}>
            Exit
          </Button>
        </div>
      </div>

      {/* ===================== 3-column body ===================== */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[240px_1fr_260px]">
        {/* Left: section tree */}
        <aside className="hidden flex-col border-r border-border bg-surface-muted/40 lg:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sections
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-[11px]"
                  disabled={atSectionLimit}
                  title={atSectionLimit ? `Maximum ${MAX_REPORT_SECTIONS} sections` : 'Add section'}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {SECTION_TYPE_OPTIONS.map((o) => {
                  const Icon = SECTION_ICONS[o.value];
                  return (
                    <DropdownMenuItem
                      key={o.value}
                      onSelect={() => void handleAddSection(o.value)}
                    >
                      <Icon className="h-3.5 w-3.5" /> {o.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {sections.length === 0 ? (
              <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                No sections yet.
                <br />
                Click “Add” to get started.
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {sections.map((s, idx) => (
                  <SectionTreeItem
                    key={s.id}
                    section={s}
                    index={idx}
                    selected={s.id === selectedId}
                    onSelect={() => setSelectedId(s.id)}
                    onRename={(title) => markSectionDirty(s.id, { title })}
                    onDuplicate={() => void handleDuplicateSection(s)}
                    onDelete={() => void handleDeleteSection(s)}
                    onMoveUp={() => void handleReorder(s, 'up')}
                    onMoveDown={() => void handleReorder(s, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < sections.length - 1}
                  />
                ))}
              </ul>
            )}
          </div>

          {atSectionLimit && (
            <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
              Section limit reached ({MAX_REPORT_SECTIONS}/{MAX_REPORT_SECTIONS}).
            </div>
          )}
        </aside>

        {/* Center: editor or preview */}
        <main className="flex min-h-0 flex-col overflow-y-auto bg-background">
          {selectedSection ? (
            previewMode ? (
              <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
                <SectionPreview section={selectedSection} />
              </div>
            ) : (
              <SectionEditorPane
                section={selectedSection}
                previousSection={previousSectionForSelected}
                onRefresh={() => void handleRefreshSection(selectedSection)}
                onChange={(patch) => markSectionDirty(selectedSection.id, patch)}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <FileText className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No section selected</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Select a section from the tree on the left, or add a new one to start building your report.
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="mt-2 gap-1.5" disabled={atSectionLimit}>
                    <Plus className="h-3.5 w-3.5" /> Add section
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-44">
                  {SECTION_TYPE_OPTIONS.map((o) => {
                    const Icon = SECTION_ICONS[o.value];
                    return (
                      <DropdownMenuItem
                        key={o.value}
                        onSelect={() => void handleAddSection(o.value)}
                      >
                        <Icon className="h-3.5 w-3.5" /> {o.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </main>

        {/* Right: properties panel */}
        <aside className="hidden flex-col overflow-y-auto border-l border-border bg-surface-muted/40 lg:flex">
          <ReportPropertiesPanel
            report={report}
            isAdmin={isAdmin}
            onReportChange={markReportDirty}
            onShare={() => setShareOpen(true)}
            onPinOfficial={() => void handlePinOfficial()}
          />
          {selectedSection && (
            <SectionPropertiesPanel
              section={selectedSection}
              onChange={(patch) => markSectionDirty(selectedSection.id, patch)}
            />
          )}
        </aside>
      </div>

      {/* Share modal */}
      <ShareModal
        reportId={report.id}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Save indicator
---------------------------------------------------------------------------- */

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      {state === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === 'saved' && <Check className="h-3 w-3 text-success" />}
      {state === 'unsaved' && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
      {state === 'error' && <AlertTriangle className="h-3 w-3 text-destructive" />}
      <span
        className={cn(
          state === 'unsaved' && 'text-warning',
          state === 'error' && 'text-destructive',
          state === 'saved' && 'text-success',
        )}
      >
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'unsaved' ? 'Unsaved changes' : 'Save failed'}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Left: section tree item
---------------------------------------------------------------------------- */

function SectionTreeItem({
  section,
  index,
  selected,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  section: ReportSection;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const Icon = SECTION_ICONS[section.type] ?? FileText;
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);

  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  const commitRename = () => {
    setEditing(false);
    const next = titleDraft.trim();
    if (next && next !== section.title) onRename(next);
    else setTitleDraft(section.title);
  };

  return (
    <li>
      <div
        className={cn(
          'group relative flex items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors',
          selected ? 'bg-primary-subtle/80' : 'hover:bg-surface-subtle/60',
        )}
      >
        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {index + 1}.
          </span>
          <Icon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              selected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          {editing ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setTitleDraft(section.title);
                  setEditing(false);
                }
              }}
              autoFocus
              className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground focus:outline-none"
            />
          ) : (
            <span
              className={cn(
                'truncate text-xs',
                selected ? 'font-medium text-foreground' : 'text-foreground',
              )}
            >
              {section.title}
            </span>
          )}
        </button>
        <SectionStatusDot status={section.loadStatus} />
        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                aria-label="Section actions"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <FileText className="h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function SectionStatusDot({ status }: { status: ReportSection['loadStatus'] }) {
  if (status === 'loading') {
    return (
      <span title="Loading" aria-label="Loading">
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-destructive"
        title="Error loading data"
        aria-label="Error loading data"
      />
    );
  }
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-success"
      title="Loaded"
      aria-label="Loaded"
    />
  );
}

/* ----------------------------------------------------------------------------
   Center: section editor pane (per type)
---------------------------------------------------------------------------- */

function SectionEditorPane({
  section,
  previousSection,
  onChange,
  onRefresh,
}: {
  section: ReportSection;
  previousSection: ReportSection | null;
  onChange: (patch: Partial<ReportSection>) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8">
      {/* Title + refresh */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground">Section title</Label>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh data
        </Button>
      </div>
      <Input
        value={section.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className="mb-5 h-10 text-base font-medium"
        placeholder="Section title"
      />

      {/* Type-specific editor */}
      <SectionConfigEditor
        section={section}
        previousSection={previousSection}
        onChange={onChange}
      />

      <Separator className="my-6" />

      {/* Live preview */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Eye className="h-3 w-3" /> Live preview
        </div>
        <Card className="py-0">
          <CardContent className="pt-4">
            <SectionPreview section={section} />
          </CardContent>
        </Card>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {formatFreshness(section.freshness)} · status: {section.loadStatus}
        </p>
      </div>
    </div>
  );
}

function SectionConfigEditor({
  section,
  previousSection,
  onChange,
}: {
  section: ReportSection;
  previousSection: ReportSection | null;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  switch (section.type) {
    case 'text':
      return <TextEditor section={section} onChange={onChange} />;
    case 'chart':
      return <ChartEditor section={section} onChange={onChange} />;
    case 'table':
      return <TableEditor section={section} onChange={onChange} />;
    case 'kpi':
      return <KpiEditor section={section} onChange={onChange} />;
    case 'ai_insight':
      return (
        <AiInsightEditor
          section={section}
          previousSection={previousSection}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function updateConfig(
  section: ReportSection,
  partial: Partial<ReportSectionConfig>,
  onChange: (patch: Partial<ReportSection>) => void,
) {
  onChange({ configuration: { ...section.configuration, ...partial } });
}

function TextEditor({
  section,
  onChange,
}: {
  section: ReportSection;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const content = section.configuration.text?.content ?? '';
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="text-content" className="text-xs font-medium">
        Markdown text
      </Label>
      <Textarea
        id="text-content"
        value={content}
        onChange={(e) =>
          updateConfig(section, { text: { content: e.target.value, format: 'markdown' } }, onChange)
        }
        placeholder="Write your narrative here. Supports **bold**, paragraphs, and bullet lists (- item)."
        className="min-h-[200px]"
      />
      <p className="text-[10px] text-muted-foreground">
        Supports paragraphs, **bold**, and bullet/numbered lists.
      </p>
    </div>
  );
}

function ChartEditor({
  section,
  onChange,
}: {
  section: ReportSection;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const cfg = section.configuration.chart ?? {
    chartType: 'bar' as ChartType,
    title: '',
    source: '',
    series: [] as ChartSeriesPoint[],
  };

  const [chatQuery, setChatQuery] = useState('');
  const [generating, setGenerating] = useState(false);

  const update = (patch: Partial<typeof cfg>) =>
    updateConfig(section, { chart: { ...cfg, ...patch } }, onChange);

  const handleGenerate = async () => {
    if (!chatQuery.trim()) {
      toast.error('Enter a question first.');
      return;
    }
    setGenerating(true);
    try {
      const result = await ServiceContainer.getInstance().aidip.chat.sendMessage({
        conversationId: null,
        text: chatQuery,
      });
      const viz = result.assistantMessage.contentJson?.visualization;
      if (!viz) {
        toast.error('No visualization was returned for that question.');
        return;
      }
      const chartType: ChartType = viz.type === 'kpi' ? 'bar' : viz.type;
      update({
        chartType,
        title: viz.title,
        source: viz.source,
        series: viz.series,
      });
      toast.success('Chart generated from your question.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mini chatbot */}
      <div className="rounded-md border border-primary/20 bg-primary-subtle/40 p-3">
        <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> Generate from a question
        </Label>
        <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
          Ask the AI assistant — it will return a chart with live data.
        </p>
        <div className="flex gap-2">
          <Input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="e.g. Show me sales by division for Q3"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGenerate();
            }}
          />
          <Button size="sm" className="gap-1.5" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Generate
          </Button>
        </div>
      </div>

      {/* Manual config */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Chart type</Label>
          <Select value={cfg.chartType} onValueChange={(v) => update({ chartType: v as ChartType })}>
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Source</Label>
          <Input
            value={cfg.source ?? ''}
            onChange={(e) => update({ source: e.target.value })}
            placeholder="e.g. Sales semantic model"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Chart title</Label>
        <Input
          value={cfg.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Q3 2026 sales by division"
          className="h-8 text-xs"
        />
      </div>

      {/* Series editor */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Data points</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() =>
              update({
                series: [...(cfg.series ?? []), { label: `Point ${(cfg.series?.length ?? 0) + 1}`, value: 0 }],
              })
            }
          >
            <Plus className="h-3 w-3" /> Add point
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {(cfg.series ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-surface-muted/40 px-3 py-3 text-[11px] text-muted-foreground">
              No data points yet. Add one manually or use the generator above.
            </p>
          ) : (
            (cfg.series ?? []).map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={p.label}
                  onChange={(e) => {
                    const next = [...(cfg.series ?? [])];
                    next[i] = { ...next[i]!, label: e.target.value };
                    update({ series: next });
                  }}
                  placeholder="Label"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={p.value}
                  onChange={(e) => {
                    const next = [...(cfg.series ?? [])];
                    next[i] = { ...next[i]!, value: Number(e.target.value) || 0 };
                    update({ series: next });
                  }}
                  placeholder="Value"
                  className="h-8 w-24 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(cfg.series ?? [])];
                    next.splice(i, 1);
                    update({ series: next });
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                  aria-label="Remove data point"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TableEditor({
  section,
  onChange,
}: {
  section: ReportSection;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const columns = section.configuration.table?.columns ?? ([] as ChatTableColumn[]);
  const rows = section.configuration.table?.rows ?? ([] as Record<string, string | number>[]);
  const [chatQuery, setChatQuery] = useState('');
  const [generating, setGenerating] = useState(false);

  const update = (patch: { columns?: ChatTableColumn[]; rows?: Record<string, string | number>[] }) =>
    updateConfig(
      section,
      {
        table: {
          columns: patch.columns ?? columns,
          rows: patch.rows ?? rows,
        },
      },
      onChange,
    );

  const handleGenerate = async () => {
    if (!chatQuery.trim()) {
      toast.error('Enter a question first.');
      return;
    }
    setGenerating(true);
    try {
      const result = await ServiceContainer.getInstance().aidip.chat.sendMessage({
        conversationId: null,
        text: chatQuery,
      });
      const table = result.assistantMessage.contentJson?.table;
      if (!table) {
        toast.error('No table was returned for that question.');
        return;
      }
      update({ columns: table.columns, rows: table.rows });
      toast.success('Table generated from your question.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mini chatbot */}
      <div className="rounded-md border border-primary/20 bg-primary-subtle/40 p-3">
        <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> Generate from a question
        </Label>
        <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
          Ask the AI assistant — it will return a populated table.
        </p>
        <div className="flex gap-2">
          <Input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="e.g. List the top 5 customers by revenue"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGenerate();
            }}
          />
          <Button size="sm" className="gap-1.5" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Generate
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        For complex tables, use the generator above. Manual column/row editing is available in the live preview — drag-to-edit coming soon.
      </p>
      {columns.length > 0 && (
        <div className="rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {columns.length} column(s) · {rows.length} row(s)
        </div>
      )}
    </div>
  );
}

function KpiEditor({
  section,
  onChange,
}: {
  section: ReportSection;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const cfg = section.configuration.kpi ?? {
    label: '',
    value: 0,
    format: 'integer' as NonNullable<ReportSectionConfig['kpi']>['format'],
  };

  const update = (patch: Partial<typeof cfg>) =>
    updateConfig(section, { kpi: { ...cfg, ...patch } }, onChange);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Label</Label>
          <Input
            value={cfg.label}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. Total Sales"
            className="h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Format</Label>
          <Select
            value={cfg.format ?? 'integer'}
            onValueChange={(v) => update({ format: v as NonNullable<typeof cfg.format> })}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="integer">Integer</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
              <SelectItem value="percent">Percent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Value</Label>
        <Input
          type="number"
          value={cfg.value}
          onChange={(e) => update({ value: Number(e.target.value) || 0 })}
          className="h-8 text-xs"
        />
      </div>
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Comparison (optional)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            value={cfg.comparison?.value ?? ''}
            onChange={(e) =>
              update({
                comparison: {
                  value: Number(e.target.value) || 0,
                  label: cfg.comparison?.label ?? 'vs previous',
                },
              })
            }
            placeholder="Change %"
            className="h-8 text-xs"
          />
          <Input
            value={cfg.comparison?.label ?? ''}
            onChange={(e) =>
              update({
                comparison: cfg.comparison
                  ? { ...cfg.comparison, label: e.target.value }
                  : { value: 0, label: e.target.value },
              })
            }
            placeholder="Comparison label"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Thresholds (optional)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            value={cfg.thresholds?.warning ?? ''}
            onChange={(e) =>
              update({
                thresholds: {
                  ...cfg.thresholds,
                  warning: e.target.value === '' ? undefined : Number(e.target.value),
                },
              })
            }
            placeholder="Warning %"
            className="h-8 text-xs"
          />
          <Input
            type="number"
            value={cfg.thresholds?.critical ?? ''}
            onChange={(e) =>
              update({
                thresholds: {
                  ...cfg.thresholds,
                  critical: e.target.value === '' ? undefined : Number(e.target.value),
                },
              })
            }
            placeholder="Critical %"
            className="h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Negative-change thresholds (e.g. -5 warning, -15 critical). Comparison ≤ threshold triggers the color.
        </p>
      </div>
    </div>
  );
}

function AiInsightEditor({
  section,
  previousSection,
  onChange,
}: {
  section: ReportSection;
  previousSection: ReportSection | null;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const cfg = section.configuration.aiInsight ?? { length: 'medium' as 'short' | 'medium' | 'long', prompt: '' };
  const [generating, setGenerating] = useState(false);

  const update = (patch: Partial<typeof cfg>) =>
    updateConfig(section, { aiInsight: { ...cfg, ...patch } }, onChange);

  const handleGenerate = async () => {
    if (!cfg.prompt?.trim()) {
      toast.error('Enter a prompt first.');
      return;
    }
    setGenerating(true);
    try {
      const previousSectionData = extractPreviousSectionData(previousSection);
      const result = await ServiceContainer.getInstance().aidip.chat.generateInsight({
        prompt: cfg.prompt,
        length: cfg.length ?? 'medium',
        previousSectionData,
      });
      if (result.ok) {
        update({ bullets: result.bullets });
        toast.success(`Generated ${result.bullets.length} insight bullet${result.bullets.length === 1 ? '' : 's'}.`);
      } else {
        toast.error(result.errorMessage ?? 'Generation failed.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Length</Label>
        <Select
          value={cfg.length ?? 'medium'}
          onValueChange={(v) => update({ length: v as 'short' | 'medium' | 'long' })}
        >
          <SelectTrigger size="sm" className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="short">Short (2 bullets)</SelectItem>
            <SelectItem value="medium">Medium (3 bullets)</SelectItem>
            <SelectItem value="long">Long (5 bullets)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Prompt</Label>
        <Textarea
          value={cfg.prompt ?? ''}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="e.g. Summarize the key findings from the previous sections and recommend next actions."
          className="min-h-[100px]"
        />
      </div>
      <Button size="sm" className="gap-1.5 self-start" onClick={() => void handleGenerate()} disabled={generating}>
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {generating ? 'Generating…' : 'Generate insight'}
      </Button>
      {cfg.bullets && cfg.bullets.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {cfg.bullets.length} bullet{cfg.bullets.length === 1 ? '' : 's'} cached · preview updated below.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Section preview (rendered as it would appear in read mode)
---------------------------------------------------------------------------- */

function SectionPreview({ section }: { section: ReportSection }) {
  if (section.loadStatus === 'error') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-4 text-xs text-destructive">
        <AlertTriangle className="h-4 w-4" /> Section data failed to load.
      </div>
    );
  }
  switch (section.type) {
    case 'text':
      return <TextPreview section={section} />;
    case 'chart':
      return <ChartPreview section={section} />;
    case 'table':
      return <TablePreview section={section} />;
    case 'kpi':
      return <KpiPreview section={section} />;
    case 'ai_insight':
      return <AiInsightPreview section={section} />;
    default:
      return null;
  }
}

function TextPreview({ section }: { section: ReportSection }) {
  const content = section.configuration.text?.content ?? '';
  if (!content.trim()) {
    return <EmptyPreview label="No text yet." />;
  }
  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
      <SimpleMarkdown text={content} />
    </div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
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

function ChartPreview({ section }: { section: ReportSection }) {
  const cfg = section.configuration.chart;
  const series = cfg?.series ?? [];
  if (series.length === 0) return <EmptyPreview label="No chart data — generate or add points." />;
  const chartType = cfg?.chartType ?? 'bar';

  return (
    <div className="flex flex-col gap-2">
      {cfg?.title && <h4 className="text-sm font-semibold text-foreground">{cfg.title}</h4>}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#0078d4" strokeWidth={2} dot={{ r: 3, fill: '#0078d4' }} />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="prev-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0078d4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0078d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke="#0078d4" strokeWidth={2} fill="url(#prev-area)" />
            </AreaChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={series}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={36}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {series.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : (
            <BarChart data={series} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {series.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {cfg?.source && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-1 w-1 rounded-full bg-success" /> {cfg.source}
        </span>
      )}
    </div>
  );
}

function TablePreview({ section }: { section: ReportSection }) {
  const cfg = section.configuration.table;
  const columns = cfg?.columns ?? [];
  const rows = cfg?.rows ?? [];
  if (columns.length === 0 || rows.length === 0) {
    return <EmptyPreview label="No table data — generate one with the assistant." />;
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-muted/60 border-b">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left text-xs font-medium text-foreground">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-xs">
                  {formatCellPreview(row[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCellPreview(value: string | number | undefined, format?: ChatTableColumn['format']): string {
  if (value === undefined || value === null) return '—';
  if (format === 'currency') return typeof value === 'number' ? formatCurrency(value) : String(value);
  if (format === 'percent') return typeof value === 'number' ? formatPercent(value) : String(value);
  if (format === 'integer') return typeof value === 'number' ? formatNumber(value) : String(value);
  return String(value);
}

function KpiPreview({ section }: { section: ReportSection }) {
  const kpi = section.configuration.kpi;
  if (!kpi) return <EmptyPreview label="No KPI configured." />;
  const valueStr =
    kpi.format === 'currency'
      ? formatCurrency(kpi.value)
      : kpi.format === 'percent'
        ? `${kpi.value.toFixed(1)}%`
        : formatNumber(kpi.value);

  let trendColor = 'text-success';
  if (kpi.comparison) {
    if (kpi.thresholds?.critical !== undefined && kpi.comparison.value <= kpi.thresholds.critical) {
      trendColor = 'text-destructive';
    } else if (kpi.thresholds?.warning !== undefined && kpi.comparison.value <= kpi.thresholds.warning) {
      trendColor = 'text-warning';
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
      <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{valueStr}</span>
      {kpi.comparison && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className={cn('font-medium', trendColor)}>{formatPercent(kpi.comparison.value)}</span>
          <span className="text-muted-foreground">{kpi.comparison.label}</span>
        </div>
      )}
    </div>
  );
}

function AiInsightPreview({ section }: { section: ReportSection }) {
  const cfg = section.configuration.aiInsight;
  const length = cfg?.length ?? 'medium';
  const bullets = cfg?.bullets ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/20 bg-gradient-to-br from-primary-subtle/60 to-surface-muted p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">AI Insight</span>
          <span className="text-[10px] text-muted-foreground">Generated · {length} length</span>
        </div>
      </div>
      {bullets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No insights generated yet. Configure a prompt above and click “Generate insight”.
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
    </div>
  );
}

function EmptyPreview({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-surface-muted/40 px-4 py-6 text-xs text-muted-foreground">
      {label}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Right: properties panels
---------------------------------------------------------------------------- */

function ReportPropertiesPanel({
  report,
  isAdmin,
  onReportChange,
  onShare,
  onPinOfficial,
}: {
  report: Report;
  isAdmin: boolean;
  onReportChange: (patch: Partial<Report>) => void;
  onShare: () => void;
  onPinOfficial: () => void;
}) {
  const [tagsRaw, setTagsRaw] = useState(report.tags.join(', '));

  useEffect(() => {
    setTagsRaw(report.tags.join(', '));
  }, [report.tags]);

  const visibilityOptions: ReportVisibility[] = isAdmin
    ? ['private', 'shared', 'company']
    : ['private', 'shared'];

  return (
    <div className="flex flex-col gap-3 border-b border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Report settings
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] font-medium">Status</Label>
        <Badge variant="outline" className="w-fit text-[10px]">
          {REPORT_STATUS_LABEL[report.status]}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prop-title" className="text-[11px] font-medium">
          Title
        </Label>
        <Input
          id="prop-title"
          value={report.title}
          onChange={(e) => onReportChange({ title: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prop-desc" className="text-[11px] font-medium">
          Description
        </Label>
        <Textarea
          id="prop-desc"
          value={report.description ?? ''}
          onChange={(e) => onReportChange({ description: e.target.value })}
          placeholder="What is this report about?"
          className="min-h-[60px] text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prop-vis" className="text-[11px] font-medium">
          Visibility
        </Label>
        <Select
          value={report.visibility === 'official' ? 'company' : report.visibility}
          onValueChange={(v) => onReportChange({ visibility: v as ReportVisibility })}
        >
          <SelectTrigger size="sm" className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibilityOptions.map((v) => (
              <SelectItem key={v} value={v}>
                {REPORT_VISIBILITY_LABEL[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isAdmin && (
          <p className="text-[10px] text-muted-foreground">
            “Company” visibility requires admin role.
          </p>
        )}
        {report.isOfficial && (
          <p className="text-[10px] text-warning">Pinned as Official by admin.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prop-tags" className="text-[11px] font-medium">
          Tags
        </Label>
        <Input
          id="prop-tags"
          value={tagsRaw}
          onChange={(e) => {
            setTagsRaw(e.target.value);
            const tags = e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t.length > 0);
            onReportChange({ tags });
          }}
          placeholder="sales, quarterly, Q3-2026"
          className="h-8 text-xs"
        />
      </div>

      <Separator className="my-1" />

      <div className="flex flex-col gap-1.5">
        {isAdmin && (
          <Button
            variant={report.isOfficial ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={onPinOfficial}
          >
            <Pin className="h-3.5 w-3.5" />
            {report.isOfficial ? 'Unpin Official' : 'Pin as Official'}
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" /> Share report
        </Button>
      </div>
    </div>
  );
}

function SectionPropertiesPanel({
  section,
  onChange,
}: {
  section: ReportSection;
  onChange: (patch: Partial<ReportSection>) => void;
}) {
  const Icon = SECTION_ICONS[section.type] ?? FileText;
  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Selected section
      </h3>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary-subtle">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-foreground">{section.title}</span>
          <span className="text-[10px] text-muted-foreground">
            {REPORT_SECTION_TYPE_LABEL[section.type]} · order {section.orderIndex + 1}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prop-sec-title" className="text-[11px] font-medium">
          Section title
        </Label>
        <Input
          id="prop-sec-title"
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] font-medium">Load status</Label>
        <div className="flex items-center gap-1.5 text-[11px]">
          <SectionStatusDot status={section.loadStatus} />
          <span className="capitalize text-muted-foreground">{section.loadStatus}</span>
        </div>
      </div>

      {section.dabQuery && (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium">DAX / DAB query</Label>
          <pre className="overflow-x-auto rounded-md border border-border bg-surface-muted/60 px-2 py-1.5 text-[10px] font-mono text-muted-foreground">
            {section.dabQuery}
          </pre>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {formatFreshness(section.updatedAt)}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Helpers
---------------------------------------------------------------------------- */

function isSectionEmpty(section: ReportSection): boolean {
  switch (section.type) {
    case 'text':
      return !(section.configuration.text?.content?.trim());
    case 'chart':
      return (section.configuration.chart?.series?.length ?? 0) === 0;
    case 'table':
      return (
        (section.configuration.table?.columns?.length ?? 0) === 0 ||
        (section.configuration.table?.rows?.length ?? 0) === 0
      );
    case 'kpi':
      return !section.configuration.kpi?.label?.trim();
    case 'ai_insight':
      return !section.configuration.aiInsight?.prompt?.trim();
    default:
      return true;
  }
}
