/**
 * AIDIP — Reports list page (Module 5 / CDC §9.1).
 *
 * Premium reports list with grid & table views, search, status and visibility
 * filters, plus per-card actions (Open / Edit / Duplicate / Share / Export /
 * Delete). Data is always live — the list shows structure metadata, not
 * cached results.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Archive,
  Copy,
  Crown,
  Edit,
  FileText,
  Grid as GridIcon,
  List as ListIcon,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Trash2,
  Download,
  Loader2,
} from 'lucide-react';

import type { Report, ReportStatus, ReportVisibility } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import {
  REPORT_STATUS_BADGE_VARIANT,
  REPORT_STATUS_LABEL,
  REPORT_VISIBILITY_LABEL,
} from '@/lib/aidip/constants';
import { formatRelativeTime, getInitials } from '@/lib/aidip/format';

import {
  PageContainer,
  PageHeader,
  EmptyState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareModal } from '@/components/aidip/ShareModal';
import { ExportConfigModal } from '@/components/aidip/ExportConfigModal';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'table';

const STATUS_FILTERS: Array<{ value: 'all' | ReportStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const VISIBILITY_FILTERS: Array<{ value: 'all' | ReportVisibility; label: string }> = [
  { value: 'all', label: 'All visibilities' },
  { value: 'private', label: 'Private' },
  { value: 'shared', label: 'Shared' },
  { value: 'company', label: 'Company' },
  { value: 'official', label: 'Official' },
];

export function ReportsListPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | ReportVisibility>('all');
  const [view, setView] = useState<ViewMode>('grid');

  // Modals
  const [shareTarget, setShareTarget] = useState<Report | null>(null);
  const [exportTarget, setExportTarget] = useState<Report | null>(null);

  // Action in-flight marker (per-id)
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.report;
      const list = await svc.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        search: search.trim() || undefined,
      });
      setReports(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, visibilityFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounce search to avoid spamming the service while typing
  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleDuplicate = async (r: Report) => {
    setBusyId(r.id);
    try {
      const copy = await ServiceContainer.getInstance().aidip.report.duplicate(r.id);
      toast.success(`Duplicated as “${copy.title}”.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate report.');
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (r: Report) => {
    setBusyId(r.id);
    try {
      await ServiceContainer.getInstance().aidip.report.archive(r.id);
      toast.success(`“${r.title}” archived.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to archive report.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (r: Report) => {
    if (!confirm(`Move “${r.title}” to trash? It will be permanently deleted in 30 days.`)) return;
    setBusyId(r.id);
    try {
      await ServiceContainer.getInstance().aidip.report.softDelete(r.id);
      toast.success(`“${r.title}” moved to trash.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete report.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleReports = reports;

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        subtitle="Build dynamic reports from your data — structure is saved, data is always live."
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/reports/new">
              <Plus className="h-4 w-4" /> New Report
            </Link>
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, or tag…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | ReportStatus)}>
            <SelectTrigger size="sm" className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={visibilityFilter}
            onValueChange={(v) => setVisibilityFilter(v as 'all' | ReportVisibility)}
          >
            <SelectTrigger size="sm" className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex h-9 items-center rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              aria-label="Grid view"
              onClick={() => setView('grid')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded transition-colors',
                view === 'grid'
                  ? 'bg-primary-subtle text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <GridIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Table view"
              onClick={() => setView('table')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded transition-colors',
                view === 'table'
                  ? 'bg-primary-subtle text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading && reports.length === 0 ? (
        <ReportsSkeleton view={view} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : visibleReports.length === 0 ? (
        <Card className="py-10">
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Create your first report to start assembling sections, charts, KPIs, and AI insights from your live data."
            action={
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/reports/new">
                  <Plus className="h-4 w-4" /> New Report
                </Link>
              </Button>
            }
          />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleReports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              busy={busyId === r.id}
              onDuplicate={() => void handleDuplicate(r)}
              onArchive={() => void handleArchive(r)}
              onDelete={() => void handleDelete(r)}
              onShare={() => setShareTarget(r)}
              onExport={() => setExportTarget(r)}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-muted/60 hover:bg-surface-muted/60">
                <TableHead className="pl-5">Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleReports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  busy={busyId === r.id}
                  onDuplicate={() => void handleDuplicate(r)}
                  onArchive={() => void handleArchive(r)}
                  onDelete={() => void handleDelete(r)}
                  onShare={() => setShareTarget(r)}
                  onExport={() => setExportTarget(r)}
                  onOpen={() => navigate(`/reports/${r.id}`)}
                  onEdit={() => navigate(`/reports/${r.id}/edit`)}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modals */}
      <ShareModal
        reportId={shareTarget?.id ?? ''}
        open={!!shareTarget}
        onOpenChange={(o) => !o && setShareTarget(null)}
      />
      <ExportConfigModal
        reportId={exportTarget?.id ?? ''}
        reportTitle={exportTarget?.title ?? ''}
        open={!!exportTarget}
        onOpenChange={(o) => !o && setExportTarget(null)}
      />
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Grid view — card
---------------------------------------------------------------------------- */

function ReportCard({
  report: r,
  busy,
  onDuplicate,
  onArchive,
  onDelete,
  onShare,
  onExport,
}: {
  report: Report;
  busy: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onExport: () => void;
}) {
  return (
    <Card className="aidip-hover-lift group relative overflow-hidden py-0">
      {/* Top row: badges + actions */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={REPORT_STATUS_BADGE_VARIANT[r.status]} className="text-[10px]">
            {REPORT_STATUS_LABEL[r.status]}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize">
            {REPORT_VISIBILITY_LABEL[r.visibility]}
          </Badge>
          {r.isOfficial && (
            <Badge className="gap-1 bg-warning text-warning-foreground text-[10px] hover:bg-warning">
              <Crown className="h-2.5 w-2.5" /> Official
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Report actions"
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link to={`/reports/${r.id}`}>
                  <FileText className="h-3.5 w-3.5" /> Open
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/reports/${r.id}/edit`}>
                  <Edit className="h-3.5 w-3.5" /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onShare}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport}>
                <Download className="h-3.5 w-3.5" /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onArchive}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <Link to={`/reports/${r.id}`} className="block px-4 py-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary">
          {r.title}
        </h3>
        {r.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
        )}

        {/* Tags */}
        {r.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {r.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                #{t}
              </span>
            ))}
            {r.tags.length > 4 && (
              <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{r.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </Link>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5">
            <AvatarFallback className="bg-primary-subtle text-[9px] font-medium text-primary">
              {getInitials(r.ownerName)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] text-muted-foreground">{r.ownerName}</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeTime(r.updatedAt)}
        </span>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   Table view — row
---------------------------------------------------------------------------- */

function ReportRow({
  report: r,
  busy,
  onDuplicate,
  onArchive,
  onDelete,
  onShare,
  onExport,
  onOpen,
  onEdit,
}: {
  report: Report;
  busy: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onExport: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <TableRow className="group">
      <TableCell className="pl-5">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-2 text-left"
        >
          {r.isOfficial && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" />}
          <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {r.title}
          </span>
        </button>
      </TableCell>
      <TableCell>
        <Badge variant={REPORT_STATUS_BADGE_VARIANT[r.status]} className="text-[10px]">
          {REPORT_STATUS_LABEL[r.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] capitalize">
          {REPORT_VISIBILITY_LABEL[r.visibility]}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Avatar className="size-5">
            <AvatarFallback className="bg-primary-subtle text-[9px] font-medium text-primary">
              {getInitials(r.ownerName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{r.ownerName}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatRelativeTime(r.updatedAt)}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {r.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              #{t}
            </span>
          ))}
          {r.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{r.tags.length - 2}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="pr-5 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Report actions"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onOpen}>
                <FileText className="h-3.5 w-3.5" /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onShare}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport}>
                <Download className="h-3.5 w-3.5" /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onArchive}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ----------------------------------------------------------------------------
   Skeleton
---------------------------------------------------------------------------- */

function ReportsSkeleton({ view }: { view: ViewMode }) {
  if (view === 'table') {
    return (
      <Card className="overflow-hidden py-0">
        <Separator />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="py-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <div className="px-4 py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-2/3" />
            <div className="mt-3 flex gap-1">
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
        </Card>
      ))}
    </div>
  );
}
