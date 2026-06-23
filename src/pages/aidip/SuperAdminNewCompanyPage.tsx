/**
 * AIDIP — Super Admin New Company Page — CDC §11 (Module 11).
 *
 * Multi-section form to provision a new tenant. On success the user is
 * redirected to the company detail page where Fabric + AI configuration
 * is completed.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import type { CompanyPlan, CompanyStatus } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';

import { PageContainer, PageHeader } from '@/components/aidip/PagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface FormState {
  name: string;
  domain: string;
  plan: CompanyPlan;
  status: CompanyStatus;
  maxUsers: number;
  maxQueriesPerDay: number;
  storageGb: number;
  subscriptionStart: string;
  subscriptionEnd: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const INITIAL: FormState = {
  name: '',
  domain: '',
  plan: 'custom',
  status: 'active',
  maxUsers: 10,
  maxQueriesPerDay: 200,
  storageGb: 5,
  subscriptionStart: todayIsoDate(),
  subscriptionEnd: '',
};

export function SuperAdminNewCompanyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (form.maxUsers < 1) next.maxUsers = 'Must allow at least 1 user.';
    if (form.maxQueriesPerDay < 1) next.maxQueriesPerDay = 'Must be at least 1.';
    if (form.storageGb < 1) next.storageGb = 'Must be at least 1 GB.';
    if (form.subscriptionEnd && form.subscriptionEnd < form.subscriptionStart) {
      next.subscriptionEnd = 'End date must be after start date.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error('Please fix the form errors before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.company;
      const created = await svc.create({
        name: form.name.trim(),
        domain: form.domain.trim() || undefined,
        plan: form.plan,
        maxUsers: form.maxUsers,
        maxQueriesPerDay: form.maxQueriesPerDay,
        storageGb: form.storageGb,
        subscriptionStart: form.subscriptionStart
          ? new Date(form.subscriptionStart).toISOString()
          : undefined,
        subscriptionEnd: form.subscriptionEnd
          ? new Date(form.subscriptionEnd).toISOString()
          : undefined,
      });
      toast.success(`Company "${created.name}" created.`);
      navigate(`/super-admin/companies/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create company.');
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="New Company"
        subtitle="Provision a new tenant on the AIDIP platform."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/super-admin/companies')}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to companies
          </Button>
        }
      />

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-primary" />
            Tenant configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 pt-5">
          {/* Basic info */}
          <section className="flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Basic info
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Identity and plan assigned to this tenant.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Name"
                required
                error={errors.name}
                hint="Display name shown across the UI."
              >
                <Input
                  placeholder="e.g. Atlas Logistics"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  aria-invalid={!!errors.name}
                />
              </Field>
              <Field label="Domain (optional)" hint="Used for email-domain allow-listing.">
                <Input
                  placeholder="atlas-logistics.ma"
                  value={form.domain}
                  onChange={(e) => update('domain', e.target.value)}
                />
              </Field>
              <Field label="Plan" hint="Free / Pro / Enterprise / Custom">
                <Select
                  value={form.plan}
                  onValueChange={(v) => update('plan', v as CompanyPlan)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Initial status" hint="Defaults to Active.">
                <Select
                  value={form.status}
                  onValueChange={(v) => update('status', v as CompanyStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <Separator className="my-6" />

          {/* Quotas */}
          <section className="flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quotas
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Limits enforced per day. Adjustable later from the company detail page.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                label="Max users"
                error={errors.maxUsers}
                hint="Including admins and analysts."
              >
                <Input
                  type="number"
                  min={1}
                  value={form.maxUsers}
                  onChange={(e) => update('maxUsers', Number(e.target.value))}
                  aria-invalid={!!errors.maxUsers}
                />
              </Field>
              <Field
                label="Max queries / day"
                error={errors.maxQueriesPerDay}
                hint="AI queries against Fabric semantic models."
              >
                <Input
                  type="number"
                  min={1}
                  value={form.maxQueriesPerDay}
                  onChange={(e) => update('maxQueriesPerDay', Number(e.target.value))}
                  aria-invalid={!!errors.maxQueriesPerDay}
                />
              </Field>
              <Field label="Storage (GB)" error={errors.storageGb} hint="Report snapshots + exports.">
                <Input
                  type="number"
                  min={1}
                  value={form.storageGb}
                  onChange={(e) => update('storageGb', Number(e.target.value))}
                  aria-invalid={!!errors.storageGb}
                />
              </Field>
            </div>
          </section>

          <Separator className="my-6" />

          {/* Subscription */}
          <section className="flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subscription
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Billing window. Leave end date empty for an evergreen (manual renewal) contract.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Start date" required>
                <Input
                  type="date"
                  value={form.subscriptionStart}
                  onChange={(e) => update('subscriptionStart', e.target.value)}
                />
              </Field>
              <Field
                label="End date (optional)"
                error={errors.subscriptionEnd}
                hint="When empty, the subscription is evergreen."
              >
                <Input
                  type="date"
                  value={form.subscriptionEnd}
                  onChange={(e) => update('subscriptionEnd', e.target.value)}
                  aria-invalid={!!errors.subscriptionEnd}
                />
              </Field>
            </div>
          </section>

          <Separator className="my-6" />

          {/* Help text */}
          <div className="rounded-md border border-primary/20 bg-primary-subtle px-3.5 py-3 text-xs text-primary">
            After creating the company, you'll need to configure Fabric connection and AI settings
            in the company detail page.
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/super-admin/companies')}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Create company
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Field wrapper
---------------------------------------------------------------------------- */

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
