/**
 * AIDIP — Export configuration modal (Module 5 / CDC §9.5).
 *
 * Lets a user request a PDF or PowerPoint snapshot of a report. Honours the
 * 3-concurrent-export limit and shows the 3 most recent snapshots for the
 * report (with download / retry actions).
 *
 * Snapshots are generated asynchronously by a worker — the user is notified
 * via the in-app notification panel when the file is ready (CDC §9.5.4).
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FileText,
  Info,
  Loader2,
  Presentation,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

import type { ExportConfigInput, ExportFormat, ReportSnapshot } from '@/lib/aidip/types';
import {
  EXPORT_STATUS_BADGE_VARIANT,
  EXPORT_STATUS_LABEL,
  MAX_CONCURRENT_EXPORTS,
} from '@/lib/aidip/constants';
import { ServiceContainer } from '@/services/ServiceContainer';
import { formatRelativeTime } from '@/lib/aidip/format';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

interface ExportConfigModalProps {
  reportId: string;
  reportTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PDF_QUALITY: Array<{ value: 'standard' | 'high'; label: string; hint: string }> = [
  { value: 'standard', label: 'Standard', hint: 'Faster · smaller file' },
  { value: 'high', label: 'High', hint: 'Sharper charts · larger file' },
];

const PPT_TEMPLATES: Array<{ value: 'standard' | 'minimal'; label: string; hint: string }> = [
  { value: 'standard', label: 'Standard', hint: 'Branded header · side rail' },
  { value: 'minimal', label: 'Minimal', hint: 'Clean · maximum content area' },
];

export function ExportConfigModal({
  reportId,
  reportTitle,
  open,
  onOpenChange,
}: ExportConfigModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // PDF options
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includeLogo, setIncludeLogo] = useState(true);
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // PPT options
  const [pptTemplate, setPptTemplate] = useState<'standard' | 'minimal'>('standard');
  const [includeDataTables, setIncludeDataTables] = useState(true);

  const loadSnapshots = useCallback(async () => {
    setLoadingSnaps(true);
    try {
      const list = await ServiceContainer.getInstance().aidip.report.listSnapshots(reportId);
      setSnapshots(list);
    } catch (e) {
      console.error('Failed to load snapshots:', e);
    } finally {
      setLoadingSnaps(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) {
      void loadSnapshots();
      // Reset form
      setFormat('pdf');
      setIncludeCoverPage(true);
      setIncludeToc(true);
      setIncludeLogo(true);
      setQuality('standard');
      setRangeFrom('');
      setRangeTo('');
      setPptTemplate('standard');
      setIncludeDataTables(true);
    }
  }, [open, loadSnapshots]);

  const buildConfig = (): ExportConfigInput => {
    if (format === 'pdf') {
      let sectionRange: ExportConfigInput['sectionRange'] = null;
      const from = rangeFrom ? parseInt(rangeFrom, 10) : NaN;
      const to = rangeTo ? parseInt(rangeTo, 10) : NaN;
      if (!Number.isNaN(from) && !Number.isNaN(to) && from >= 1 && to >= from) {
        sectionRange = { from, to };
      }
      return {
        format: 'pdf',
        includeCoverPage,
        includeTableOfContents: includeToc,
        includeCompanyLogo: includeLogo,
        quality,
        sectionRange,
      };
    }
    return {
      format: 'ppt',
      pptTemplate,
      includeDataTables,
    };
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await ServiceContainer.getInstance().aidip.report.requestExport(reportId, buildConfig());
      toast.success(
        'Your export is being generated. This usually takes 1–3 minutes. You will be notified when it’s ready.',
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to request export.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (snapshot: ReportSnapshot) => {
    try {
      await ServiceContainer.getInstance().aidip.report.requestExport(reportId, {
        format: snapshot.format,
        includeCoverPage: true,
        includeTableOfContents: true,
        includeCompanyLogo: true,
        quality: 'standard',
        sectionRange: null,
      });
      toast.success('Export queued for retry.');
      await loadSnapshots();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to retry export.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export “{reportTitle}”</DialogTitle>
          <DialogDescription>
            Generate a static snapshot of this report. The export runs in the background — you’ll be notified when it’s ready.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="flex flex-col gap-4 pb-2">
            {/* Format selector */}
            <div className="flex flex-col gap-1.5">
              <Label>Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(v) => setFormat(v as ExportFormat)}
                className="grid grid-cols-2 gap-2"
              >
                <FormatCard
                  value="pdf"
                  label="PDF"
                  hint="Best for sharing & printing"
                  icon={FileText}
                  checked={format === 'pdf'}
                />
                <FormatCard
                  value="ppt"
                  label="PowerPoint"
                  hint="Best for presentations"
                  icon={Presentation}
                  checked={format === 'ppt'}
                />
              </RadioGroup>
            </div>

            {/* Format-specific options */}
            {format === 'pdf' ? (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-muted/40 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <CheckboxRow
                    id="pdf-cover"
                    label="Cover page"
                    checked={includeCoverPage}
                    onChange={setIncludeCoverPage}
                  />
                  <CheckboxRow
                    id="pdf-toc"
                    label="Table of contents"
                    checked={includeToc}
                    onChange={setIncludeToc}
                  />
                  <CheckboxRow
                    id="pdf-logo"
                    label="Company logo"
                    checked={includeLogo}
                    onChange={setIncludeLogo}
                  />
                </div>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">Quality</Label>
                  <RadioGroup
                    value={quality}
                    onValueChange={(v) => setQuality(v as 'standard' | 'high')}
                    className="grid grid-cols-2 gap-2"
                  >
                    {PDF_QUALITY.map((q) => (
                      <Label
                        key={q.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors',
                          quality === q.value
                            ? 'border-primary bg-primary-subtle/60'
                            : 'border-border bg-card hover:bg-muted',
                        )}
                      >
                        <RadioGroupItem value={q.value} id={`pdf-q-${q.value}`} className="mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-foreground">{q.label}</span>
                          <span className="text-[11px] text-muted-foreground">{q.hint}</span>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">
                    Section range <span className="text-muted-foreground">(optional — blank = all)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="From"
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="number"
                      min={1}
                      placeholder="To"
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-muted/40 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">Template</Label>
                  <RadioGroup
                    value={pptTemplate}
                    onValueChange={(v) => setPptTemplate(v as 'standard' | 'minimal')}
                    className="grid grid-cols-2 gap-2"
                  >
                    {PPT_TEMPLATES.map((t) => (
                      <Label
                        key={t.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors',
                          pptTemplate === t.value
                            ? 'border-primary bg-primary-subtle/60'
                            : 'border-border bg-card hover:bg-muted',
                        )}
                      >
                        <RadioGroupItem value={t.value} id={`ppt-t-${t.value}`} className="mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-foreground">{t.label}</span>
                          <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <Separator />
                <CheckboxRow
                  id="ppt-tables"
                  label="Include data tables"
                  checked={includeDataTables}
                  onChange={setIncludeDataTables}
                />
              </div>
            )}

            {/* Concurrency note */}
            <div className="flex items-start gap-2 rounded-md border border-border bg-info-subtle/60 px-3 py-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
              <p className="text-[11px] text-foreground">
                Maximum {MAX_CONCURRENT_EXPORTS} concurrent exports per company. If the limit is reached, your export is queued and you will be notified when processing starts.
              </p>
            </div>

            {/* Recent exports */}
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent exports
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                  onClick={() => void loadSnapshots()}
                  disabled={loadingSnaps}
                >
                  <RefreshCw className={cn('h-3 w-3', loadingSnaps && 'animate-spin')} /> Refresh
                </Button>
              </div>
              {loadingSnaps ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : snapshots.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-surface-muted/40 px-4 py-5 text-center text-xs text-muted-foreground">
                  No exports yet for this report.
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {snapshots.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex size-7 items-center justify-center rounded-md bg-muted">
                        {s.format === 'pdf' ? (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Presentation className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium uppercase tracking-wide text-foreground">
                            {s.format}
                          </span>
                          <Badge variant={EXPORT_STATUS_BADGE_VARIANT[s.status]} className="text-[10px]">
                            {s.status === 'completed' && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {s.status === 'failed' && <AlertCircle className="h-2.5 w-2.5" />}
                            {EXPORT_STATUS_LABEL[s.status]}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Requested {formatRelativeTime(s.requestedAt)}
                          {s.fileSizeKb ? ` · ${s.fileSizeKb} KB` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.status === 'completed' && s.signedUrl && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-[11px]"
                          >
                            <a href={s.signedUrl} target="_blank" rel="noreferrer">
                              <Download className="h-3 w-3" /> Download
                            </a>
                          </Button>
                        )}
                        {s.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                            onClick={() => void handleRetry(s)}
                          >
                            <RefreshCw className="h-3 w-3" /> Retry
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting} className="gap-1.5">
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            Generate Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function FormatCard({
  value,
  label,
  hint,
  icon: Icon,
  checked,
}: {
  value: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  checked: boolean;
}) {
  return (
    <Label
      htmlFor={`fmt-${value}`}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
        checked ? 'border-primary bg-primary-subtle/60' : 'border-border bg-card hover:bg-muted',
      )}
    >
      <RadioGroupItem value={value} id={`fmt-${value}`} className="mt-0.5" />
      <div className="flex size-7 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
    </Label>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="cursor-pointer text-xs font-medium text-foreground">
        {label}
      </Label>
    </div>
  );
}
