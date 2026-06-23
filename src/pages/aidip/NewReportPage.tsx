/**
 * AIDIP — New report page (Module 5 / CDC §9.2).
 *
 * Minimal scaffolding form: title (required), description (optional), tags
 * (comma-separated). On submit, creates the report and routes the user to
 * the 3-column editor to start adding sections.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';

import { ServiceContainer } from '@/services/ServiceContainer';

import { PageContainer, PageHeader } from '@/components/aidip/PagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function NewReportPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsedTags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('A title is required.');
      return;
    }
    setSubmitting(true);
    try {
      const report = await ServiceContainer.getInstance().aidip.report.create({
        title: title.trim(),
        description: description.trim() || undefined,
        tags: parsedTags,
      });
      toast.success('Report created.');
      navigate(`/reports/${report.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="New Report"
        subtitle="Give your report a title and a short description — you can add sections next."
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/reports">
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="report-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 2026 Sales Performance Review"
                autoFocus
                maxLength={120}
              />
              <p className="text-[11px] text-muted-foreground">
                {title.length}/120 — keep titles short and descriptive.
              </p>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this report about? Who is it for?"
                className="min-h-[96px]"
                maxLength={500}
              />
              <p className="text-[11px] text-muted-foreground">{description.length}/500</p>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-tags">
                Tags <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="report-tags"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="sales, quarterly, Q3-2026"
              />
              <p className="text-[11px] text-muted-foreground">
                Comma-separated. Helps with search and grouping.
              </p>
              {parsedTags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {parsedTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/reports')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !title.trim()} className="gap-1.5">
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Create report
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
