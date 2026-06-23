/**
 * AIDIP Admin — Company Settings page (Module 7, CDC §10).
 *
 * Route: /admin/settings  (admin + super_admin only)
 *
 * Three tabs:
 *   1. General — company name, logo upload, default timezone / currency,
 *      read-only language.
 *   2. Dashboard KPIs — list / add / edit / remove the KPI cards shown on
 *      every team member's dashboard (max 4 for MVP).
 *   3. Dataset Permissions — per-dataset role access matrix + column
 *      visibility, applied to Data API Builder (DAB) Row-Level Security.
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Image as ImageIcon,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import BoxIcon from 'lucide-react/dist/esm/icons/box';
import ClockIcon from 'lucide-react/dist/esm/icons/clock';
import FileIcon from 'lucide-react/dist/esm/icons/file-text';
import MessageIcon from 'lucide-react/dist/esm/icons/message-square';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up';
import UsersIcon from 'lucide-react/dist/esm/icons/users';

import type { Company, KpiCard } from '@/lib/aidip/types';
import {
  MAX_DASHBOARD_KPIS,
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
} from '@/lib/aidip/constants';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { cn } from '@/lib/utils';

import {
  PageContainer,
  PageHeader,
  LoadingState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ----------------------------------------------------------------------------
   Constants
---------------------------------------------------------------------------- */

const KPI_ICONS: Record<KpiCard['icon'], { label: string; icon: LucideIcon }> = {
  revenue: { label: 'Revenue', icon: TrendingUpIcon },
  inventory: { label: 'Inventory', icon: BoxIcon },
  customers: { label: 'Customers', icon: UsersIcon },
  growth: { label: 'Growth', icon: SparklesIcon },
  queries: { label: 'Queries', icon: MessageIcon },
  users: { label: 'Users', icon: UsersIcon },
  reports: { label: 'Reports', icon: FileIcon },
  uptime: { label: 'Uptime', icon: ClockIcon },
};

const VALUE_TYPES: { value: KpiCard['valueType']; label: string }[] = [
  { value: 'amount', label: 'Amount' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'integer', label: 'Integer' },
];

const REFERENCE_PERIODS = [
  { value: 'current_month', label: 'Current month' },
  { value: 'current_quarter', label: 'Current quarter' },
  { value: 'current_year', label: 'Current year' },
  { value: 'custom', label: 'Custom' },
] as const;

const COMPARISONS = [
  { value: 'previous_period', label: 'Previous period' },
  { value: 'same_period_n_1', label: 'Same period N-1' },
  { value: 'none', label: 'None' },
] as const;

type ReferencePeriod = (typeof REFERENCE_PERIODS)[number]['value'];
type Comparison = (typeof COMPARISONS)[number]['value'];

interface KpiFormState {
  title: string;
  icon: KpiCard['icon'];
  valueType: KpiCard['valueType'];
  source: string;
  dabQuery: string;
  referencePeriod: ReferencePeriod;
  comparison: Comparison;
  format: string;
}

/* ----------------------------------------------------------------------------
   Dataset Permissions mock data
---------------------------------------------------------------------------- */

interface DatasetPermission {
  id: string;
  name: string;
  description: string;
  columns: { name: string; admin: boolean; analyst: boolean }[];
  access: { admin: boolean; analyst: boolean };
}

const INITIAL_DATASETS: DatasetPermission[] = [
  {
    id: 'ds-sales',
    name: 'Sales',
    description: 'Orders, revenue, products, regions.',
    access: { admin: true, analyst: true },
    columns: [
      { name: 'order_id', admin: true, analyst: true },
      { name: 'customer_id', admin: true, analyst: true },
      { name: 'product_id', admin: true, analyst: true },
      { name: 'amount', admin: true, analyst: true },
      { name: 'region', admin: true, analyst: true },
      { name: 'cost', admin: true, analyst: false },
    ],
  },
  {
    id: 'ds-customers',
    name: 'Customers',
    description: 'Customer accounts, segments, contact info.',
    access: { admin: true, analyst: true },
    columns: [
      { name: 'customer_id', admin: true, analyst: true },
      { name: 'full_name', admin: true, analyst: true },
      { name: 'email', admin: true, analyst: true },
      { name: 'phone', admin: true, analyst: false },
      { name: 'segment', admin: true, analyst: true },
    ],
  },
  {
    id: 'ds-inventory',
    name: 'Inventory',
    description: 'Stock levels, warehouses, SKUs.',
    access: { admin: true, analyst: false },
    columns: [
      { name: 'sku', admin: true, analyst: true },
      { name: 'warehouse', admin: true, analyst: false },
      { name: 'quantity', admin: true, analyst: true },
      { name: 'reorder_point', admin: true, analyst: false },
    ],
  },
  {
    id: 'ds-operations',
    name: 'Operations',
    description: 'Shipments, deliveries, SLA metrics.',
    access: { admin: true, analyst: true },
    columns: [
      { name: 'shipment_id', admin: true, analyst: true },
      { name: 'origin', admin: true, analyst: true },
      { name: 'destination', admin: true, analyst: true },
      { name: 'sla_status', admin: true, analyst: true },
      { name: 'cost_internal', admin: true, analyst: false },
    ],
  },
  {
    id: 'ds-hr',
    name: 'HR',
    description: 'Employees, salaries, performance — restricted to Admin.',
    access: { admin: true, analyst: false },
    columns: [
      { name: 'employee_id', admin: true, analyst: false },
      { name: 'full_name', admin: true, analyst: false },
      { name: 'salary', admin: true, analyst: false },
      { name: 'performance_score', admin: true, analyst: false },
    ],
  },
];

const DEFAULT_KPI_FORM: KpiFormState = {
  title: '',
  icon: 'revenue',
  valueType: 'amount',
  source: '',
  dabQuery: '',
  referencePeriod: 'current_month',
  comparison: 'previous_period',
  format: 'MAD',
};

/* ----------------------------------------------------------------------------
   Page component
---------------------------------------------------------------------------- */

export function AdminSettingsPage() {
  const { user } = useAidipSession();
  const [tab, setTab] = useState<'general' | 'kpis' | 'permissions'>('general');

  /* ----- General tab ----- */
  const [company, setCompany] = useState<Company | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [generalForm, setGeneralForm] = useState({
    name: '',
    defaultTimezone: 'Africa/Casablanca' as string,
    defaultCurrency: 'MAD' as string,
    logoUrl: '' as string,
  });
  const [savingGeneral, setSavingGeneral] = useState(false);

  /* ----- KPIs tab ----- */
  const [kpis, setKpis] = useState<KpiCard[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [kpiForm, setKpiForm] = useState<KpiFormState>(DEFAULT_KPI_FORM);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [kpiDeleteId, setKpiDeleteId] = useState<string | null>(null);

  /* ----- Permissions tab ----- */
  const [datasets, setDatasets] = useState<DatasetPermission[]>(INITIAL_DATASETS);
  const [expandedDataset, setExpandedDataset] = useState<string | null>(INITIAL_DATASETS[0]?.id ?? null);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  /* -------------------------------------------------------------------------
     Loaders
  ------------------------------------------------------------------------- */
  const loadCompany = useCallback(async () => {
    if (!user?.companyId) {
      setCompanyLoading(false);
      return;
    }
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const c = await ServiceContainer.getInstance().aidip.company.get(user.companyId);
      if (!c) {
        setCompanyError('Company not found.');
        return;
      }
      setCompany(c);
      setGeneralForm({
        name: c.name,
        defaultTimezone: c.defaultTimezone,
        defaultCurrency: c.defaultCurrency,
        logoUrl: c.logoUrl ?? '',
      });
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : 'Failed to load company.');
    } finally {
      setCompanyLoading(false);
    }
  }, [user?.companyId]);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    setKpisError(null);
    try {
      const list = await ServiceContainer.getInstance().aidip.kpiConfig.list();
      setKpis(list);
    } catch (e) {
      setKpisError(e instanceof Error ? e.message : 'Failed to load KPIs.');
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    if (tab === 'kpis') void loadKpis();
  }, [tab, loadKpis]);

  /* -------------------------------------------------------------------------
     Handlers — General
  ------------------------------------------------------------------------- */
  const handleSaveGeneral = async () => {
    if (!company) return;
    setSavingGeneral(true);
    try {
      const updated = await ServiceContainer.getInstance().aidip.company.update(company.id, {
        name: generalForm.name,
        defaultTimezone: generalForm.defaultTimezone,
        defaultCurrency: generalForm.defaultCurrency,
        logoUrl: generalForm.logoUrl || null,
      });
      setCompany(updated);
      toast.success('Company settings saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Logo must be a PNG or JPG file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file size must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      setGeneralForm((s) => ({ ...s, logoUrl: url }));
      toast.success('Logo uploaded (mock).');
    };
    reader.readAsDataURL(file);
  };

  /* -------------------------------------------------------------------------
     Handlers — KPIs
  ------------------------------------------------------------------------- */
  const openCreateKpi = () => {
    setEditingKpiId(null);
    setKpiForm(DEFAULT_KPI_FORM);
    setKpiDialogOpen(true);
  };

  const openEditKpi = (kpi: KpiCard) => {
    setEditingKpiId(kpi.id);
    setKpiForm({
      title: kpi.title,
      icon: kpi.icon,
      valueType: kpi.valueType,
      source: kpi.source ?? '',
      dabQuery: kpi.dabQuery ?? '',
      referencePeriod: 'current_month',
      comparison: kpi.comparison ? 'previous_period' : 'none',
      format: kpi.format,
    });
    setKpiDialogOpen(true);
  };

  const handleSaveKpi = async () => {
    if (!kpiForm.title.trim()) {
      toast.error('KPI title is required.');
      return;
    }
    setKpiSaving(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.kpiConfig;
      const payload = {
        title: kpiForm.title.trim(),
        icon: kpiForm.icon,
        valueType: kpiForm.valueType,
        value: 0,
        format: kpiForm.format || (kpiForm.valueType === 'percentage' ? '%' : 'integer'),
        comparison: kpiForm.comparison === 'none' ? null : { value: 0, label: 'vs previous period' },
        sparkline: [],
        source: kpiForm.source.trim() || undefined,
        dabQuery: kpiForm.dabQuery.trim() || undefined,
      };
      if (editingKpiId) {
        await svc.update(editingKpiId, payload);
        toast.success('KPI updated.');
      } else {
        await svc.create(payload);
        toast.success('KPI added.');
      }
      setKpiDialogOpen(false);
      await loadKpis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save KPI.');
    } finally {
      setKpiSaving(false);
    }
  };

  const handleDeleteKpi = async () => {
    if (!kpiDeleteId) return;
    try {
      await ServiceContainer.getInstance().aidip.kpiConfig.remove(kpiDeleteId);
      toast.success('KPI removed.');
      setKpiDeleteId(null);
      await loadKpis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove KPI.');
    }
  };

  /* -------------------------------------------------------------------------
     Handlers — Permissions
  ------------------------------------------------------------------------- */
  const toggleDatasetAccess = (dsId: string, role: 'admin' | 'analyst') => {
    setDatasets((prev) =>
      prev.map((ds) =>
        ds.id === dsId
          ? { ...ds, access: { ...ds.access, [role]: !ds.access[role] } }
          : ds,
      ),
    );
  };

  const toggleColumnVisibility = (
    dsId: string,
    colIdx: number,
    role: 'admin' | 'analyst',
  ) => {
    setDatasets((prev) =>
      prev.map((ds) => {
        if (ds.id !== dsId) return ds;
        const next = [...ds.columns];
        const col = next[colIdx];
        if (col) next[colIdx] = { ...col, [role]: !col[role] };
        return { ...ds, columns: next };
      }),
    );
  };

  const handleApplyPermissions = async () => {
    setPermissionsSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setPermissionsSaving(false);
    toast.success('Permissions applied (mock — would trigger DAB config update).');
  };

  /* -------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------- */
  return (
    <PageContainer>
      <PageHeader
        title="Company Settings"
        subtitle="Manage your company profile, dashboard KPIs and dataset permissions."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-1.5">
            Dashboard KPIs
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            Dataset Permissions
          </TabsTrigger>
        </TabsList>

        {/* ============== General tab ============== */}
        <TabsContent value="general">
          {companyLoading ? (
            <Card className="py-6">
              <LoadingState label="Loading company settings…" />
            </Card>
          ) : companyError ? (
            <Card className="py-6">
              <ErrorState message={companyError} onRetry={() => void loadCompany()} />
            </Card>
          ) : company ? (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle className="text-sm">Company profile</CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-5">
                <div className="grid gap-5 md:grid-cols-2">
                  {/* Company name */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="company-name">Company name</Label>
                    <Input
                      id="company-name"
                      value={generalForm.name}
                      onChange={(e) =>
                        setGeneralForm((s) => ({ ...s, name: e.target.value }))
                      }
                      placeholder="Company name"
                    />
                  </div>

                  {/* Logo upload */}
                  <div className="grid gap-1.5">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {generalForm.logoUrl ? (
                          <img
                            src={generalForm.logoUrl}
                            alt="Company logo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <label className="flex h-32 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted/30 px-4 text-center transition-colors hover:border-primary hover:bg-primary-subtle/30">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">
                          Click to upload
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          PNG or JPG · max 2 MB
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={handleLogoUpload}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Timezone */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="default-tz">Default timezone</Label>
                    <Select
                      value={generalForm.defaultTimezone}
                      onValueChange={(v) =>
                        setGeneralForm((s) => ({ ...s, defaultTimezone: v }))
                      }
                    >
                      <SelectTrigger id="default-tz" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Currency */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="default-currency">Default currency</Label>
                    <Select
                      value={generalForm.defaultCurrency}
                      onValueChange={(v) =>
                        setGeneralForm((s) => ({ ...s, defaultCurrency: v }))
                      }
                    >
                      <SelectTrigger id="default-currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Language (read-only) */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="language">Language</Label>
                    <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                      English (locked for MVP)
                    </div>
                  </div>
                </div>

                <Separator className="my-5" />

                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={() => void handleSaveGeneral()}
                    disabled={savingGeneral}
                    className="gap-1.5"
                  >
                    {savingGeneral && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ============== Dashboard KPIs tab ============== */}
        <TabsContent value="kpis">
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
              <div>
                <CardTitle className="text-sm">Dashboard KPIs</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Configure the KPI cards displayed on every team member's dashboard.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={openCreateKpi}
                disabled={kpis.length >= MAX_DASHBOARD_KPIS}
              >
                <Plus className="h-4 w-4" />
                Add KPI
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {kpisLoading ? (
                <div className="px-5 py-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="mb-3 h-16 w-full rounded-md" />
                  ))}
                </div>
              ) : kpisError ? (
                <ErrorState message={kpisError} onRetry={() => void loadKpis()} />
              ) : kpis.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">No KPIs configured.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add up to {MAX_DASHBOARD_KPIS} KPI cards to display on the dashboard.
                  </p>
                  <Button className="mt-3 gap-1.5" onClick={openCreateKpi}>
                    <Plus className="h-4 w-4" />
                    Add your first KPI
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {kpis.map((kpi) => {
                    const meta = KPI_ICONS[kpi.icon];
                    const Icon = meta?.icon ?? TrendingUpIcon;
                    return (
                      <li
                        key={kpi.id}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {kpi.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {kpi.source ?? 'No source configured'}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {kpi.valueType}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {meta?.label ?? kpi.icon}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditKpi(kpi)}
                            aria-label="Edit KPI"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setKpiDeleteId(kpi.id)}
                            aria-label="Remove KPI"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
            <Separator />
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-xs text-muted-foreground">
                {kpis.length} / {MAX_DASHBOARD_KPIS} KPIs configured. Maximum {MAX_DASHBOARD_KPIS} for MVP.
                KPIs are visible to all company members on their dashboard.
              </p>
            </div>
          </Card>
        </TabsContent>

        {/* ============== Dataset Permissions tab ============== */}
        <TabsContent value="permissions">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                Dataset permissions
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Configure role access and column visibility per dataset.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {datasets.map((ds) => {
                  const expanded = expandedDataset === ds.id;
                  return (
                    <li key={ds.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedDataset(expanded ? null : ds.id)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                          <Database className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{ds.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {ds.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <RoleAccessBadge role="Admin" allowed={ds.access.admin} />
                          <RoleAccessBadge role="Analyst" allowed={ds.access.analyst} />
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-border bg-muted/20 px-5 py-4">
                          {/* Role access matrix */}
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Role access
                          </p>
                          <div className="mb-4 flex items-center gap-6">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={ds.access.admin}
                                onChange={() => toggleDatasetAccess(ds.id, 'admin')}
                                className="size-4 rounded border-border accent-primary"
                              />
                              <span className="text-foreground">Admin</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={ds.access.analyst}
                                onChange={() => toggleDatasetAccess(ds.id, 'analyst')}
                                className="size-4 rounded border-border accent-primary"
                              />
                              <span className="text-foreground">Analyst</span>
                            </label>
                          </div>

                          {/* Column visibility matrix */}
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Column visibility
                          </p>
                          <div className="overflow-hidden rounded-md border border-border bg-card">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                    Column
                                  </th>
                                  <th className="w-20 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                                    Admin
                                  </th>
                                  <th className="w-20 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                                    Analyst
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {ds.columns.map((col, idx) => (
                                  <tr key={col.name} className="hover:bg-muted/30">
                                    <td className="px-3 py-2 font-mono text-xs text-foreground">
                                      {col.name}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={col.admin}
                                        onChange={() =>
                                          toggleColumnVisibility(ds.id, idx, 'admin')
                                        }
                                        className="size-4 rounded border-border accent-primary"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={col.analyst}
                                        onChange={() =>
                                          toggleColumnVisibility(ds.id, idx, 'analyst')
                                        }
                                        className="size-4 rounded border-border accent-primary"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
            <Separator />
            <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                These permissions configure Row-Level Security in Data API Builder.
                Changes apply to all new queries.
              </p>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void handleApplyPermissions()}
                disabled={permissionsSaving}
              >
                {permissionsSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Apply permissions
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============== KPI dialog (create / edit) ============== */}
      <Dialog open={kpiDialogOpen} onOpenChange={setKpiDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {editingKpiId ? 'Edit KPI' : 'Add a KPI'}
            </DialogTitle>
            <DialogDescription>
              KPIs are visible to all company members on their dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="kpi-title">Title</Label>
              <Input
                id="kpi-title"
                value={kpiForm.title}
                onChange={(e) => setKpiForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Total Sales (Q3 2026)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Icon</Label>
                <Select
                  value={kpiForm.icon}
                  onValueChange={(v) => setKpiForm((s) => ({ ...s, icon: v as KpiCard['icon'] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['revenue', 'inventory', 'customers', 'growth'] as const).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KPI_ICONS[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Value type</Label>
                <Select
                  value={kpiForm.valueType}
                  onValueChange={(v) =>
                    setKpiForm((s) => ({ ...s, valueType: v as KpiCard['valueType'] }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_TYPES.map((vt) => (
                      <SelectItem key={vt.value} value={vt.value}>
                        {vt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="kpi-source">Source</Label>
              <Input
                id="kpi-source"
                value={kpiForm.source}
                onChange={(e) => setKpiForm((s) => ({ ...s, source: e.target.value }))}
                placeholder="e.g. Sales semantic model"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="kpi-dab">Fabric measure / DAB query</Label>
              <Input
                id="kpi-dab"
                value={kpiForm.dabQuery}
                onChange={(e) => setKpiForm((s) => ({ ...s, dabQuery: e.target.value }))}
                placeholder="e.g. SUM('Sales'[Amount])"
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Reference period</Label>
                <Select
                  value={kpiForm.referencePeriod}
                  onValueChange={(v) =>
                    setKpiForm((s) => ({ ...s, referencePeriod: v as ReferencePeriod }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_PERIODS.map((rp) => (
                      <SelectItem key={rp.value} value={rp.value}>
                        {rp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Comparison</Label>
                <Select
                  value={kpiForm.comparison}
                  onValueChange={(v) =>
                    setKpiForm((s) => ({ ...s, comparison: v as Comparison }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARISONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="kpi-format">Format</Label>
              <Input
                id="kpi-format"
                value={kpiForm.format}
                onChange={(e) => setKpiForm((s) => ({ ...s, format: e.target.value }))}
                placeholder="e.g. MAD, %, integer"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setKpiDialogOpen(false)}
              disabled={kpiSaving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveKpi()} disabled={kpiSaving} className="gap-1.5">
              {kpiSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save KPI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== KPI delete confirmation ============== */}
      <AlertDialog
        open={!!kpiDeleteId}
        onOpenChange={(o) => !o && setKpiDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this KPI?</AlertDialogTitle>
            <AlertDialogDescription>
              The KPI will no longer appear on team dashboards. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteKpi();
              }}
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4" />
              Remove KPI
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function RoleAccessBadge({ role, allowed }: { role: string; allowed: boolean }) {
  return (
    <Badge
      variant={allowed ? 'default' : 'outline'}
      className={cn('text-[10px]', !allowed && 'text-muted-foreground')}
    >
      {role}: {allowed ? 'On' : 'Off'}
    </Badge>
  );
}
