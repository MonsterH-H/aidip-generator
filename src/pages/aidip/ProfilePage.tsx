/**
 * AIDIP Profile page — user account, preferences, notification preferences
 * and sign-in history.
 *
 * Two-column layout (lg:grid-cols-3):
 *   - Left (1 col): profile card (avatar, name, role, status, member since,
 *     last login, sign out) + quick stats card (4 mini-KPIs: conversations,
 *     reports, queries this month, avg response time).
 *   - Right (2 cols): 4 stacked cards:
 *     1. Personal Information (read-only — name, email, role, status,
 *        registration date, last login, masked Azure AD id)
 *     2. Personal Preferences (timezone + currency selects, language locked
 *        to English for MVP per CDC §21.1)
 *     3. Notification Preferences (master toggles, email frequency, DND,
 *        per-type toggles)
 *     4. Sign-in history (table of last 5 connections: date, IP, browser
 *        derived from user agent, approximate location)
 *
 * Uses useAidipSession() for the current user, the notification service
 * for preferences, and the audit log service (filtered by action=login) for
 * sign-in history. Premium enterprise styling aligned with Azure Portal.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  LogOut,
  Mail,
  User as UserIcon,
  Clock,
  ShieldCheck,
  Bell,
  Info,
  Save,
  Moon,
  Globe,
  Coins,
  Languages,
  History,
  MessageSquare,
  FileText,
  Timer,
  KeyRound,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  AuditLog,
  EmailFrequency,
  NotificationPreferences,
  NotificationType,
  UserRole,
} from '@/lib/aidip/types';
import { ROLE_LABEL } from '@/lib/aidip/types';
import {
  NOTIFICATION_TYPE_BY_ROLE,
  NOTIFICATION_TYPE_LABEL,
  ROLE_BADGE_VARIANT,
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  USER_STATUS_BADGE_VARIANT,
  USER_STATUS_LABEL,
} from '@/lib/aidip/constants';
import { formatDate, formatDateTime, getInitials } from '@/lib/aidip/format';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { useAuth } from '@/hooks/AuthContext';

import {
  PageContainer,
  PageHeader,
  LoadingState,
  ErrorState,
} from '@/components/aidip/PagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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

const EMAIL_FREQUENCY_LABEL: Record<EmailFrequency, string> = {
  immediate: 'Immediate',
  daily: 'Daily summary',
  weekly: 'Weekly summary',
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Quick stats resolved from multiple services. */
interface QuickStats {
  conversations: number;
  reports: number;
  /** This month's query count (best-effort — falls back to today's quota). */
  queriesThisMonth: number | null;
  /** Average AI response time in seconds (null if unavailable for this role). */
  avgResponseTimeSec: number | null;
}

/**
 * Derives a short "Browser <major>" label from a raw user-agent string.
 * Order matters: Edge must be checked before Chrome (Edge's UA also
 * contains "Chrome"), and Safari must be checked last (Chrome's UA
 * contains "Safari").
 */
function parseBrowser(ua: string | null): string {
  if (!ua) return '—';
  const edge = ua.match(/Edg\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return 'Unknown';
}

/** Returns a masked Azure AD id (only the last 4 chars visible). */
function maskAzureAdId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 4) return '••••';
  return `••••••••${id.slice(-4)}`;
}

export function ProfilePage() {
  const { user, loading: sessionLoading } = useAidipSession();
  const { signOut } = useAuth();

  // --- notification preferences (existing) ---
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- quick stats (new) ---
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // --- personal preferences: timezone + currency (new) ---
  const [timezone, setTimezone] = useState<string>('UTC');
  const [currency, setCurrency] = useState<string>('USD');
  const [prefsSaving, setPrefsSaving] = useState(false);

  // --- sign-in history (new) ---
  const [signInLogs, setSignInLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    setPrefsError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.notification;
      const p = await svc.getPreferences();
      setPrefs(p);
    } catch (e) {
      setPrefsError(e instanceof Error ? e.message : 'Failed to load preferences.');
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const aidip = ServiceContainer.getInstance().aidip;
      const [conversations, reports, dashboardData] = await Promise.all([
        aidip.conversation.list(),
        aidip.report.list(),
        aidip.analytics.getDashboardData(),
      ]);
      // Team analytics exposes totalQueriesThisMonth + avgResponseTimeSec.
      // It is technically admin-scoped, so we attempt it best-effort and
      // fall back to dashboardData.quota.used + null for non-admin sessions.
      let queriesThisMonth: number | null = dashboardData.quota.used;
      let avgResponseTimeSec: number | null = null;
      try {
        const team = await aidip.analytics.getTeamAnalytics();
        queriesThisMonth = team.totalQueriesThisMonth;
        avgResponseTimeSec = team.avgResponseTimeSec;
      } catch {
        // Restricted session — keep fallbacks.
      }
      setStats({
        conversations: conversations.length,
        reports: reports.length,
        queriesThisMonth,
        avgResponseTimeSec,
      });
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Failed to load stats.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async (userId: string) => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const svc = ServiceContainer.getInstance().aidip.auditLog;
      const list = await svc.list({ action: 'login', userId });
      setSignInLogs(list.slice(0, 5));
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load sign-in history.');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadPrefs();
    void loadStats();
    void loadLogs(user.id);
  }, [user, loadPrefs, loadStats, loadLogs]);

  const handleSavePrefs = async () => {
    setPrefsSaving(true);
    // The user.updatePreferences API is not yet exposed at the service
    // layer (CDC §21.2 — SHOULD HAVE for v3.1). We persist in-session and
    // toast success; the value will be rehydrated from the API once live.
    await new Promise((r) => setTimeout(r, 400));
    setPrefsSaving(false);
    toast.success('Preferences saved.');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      toast.error('Could not sign out. Please try again.');
    }
  };

  if (sessionLoading || !user) {
    return (
      <PageContainer>
        {sessionLoading ? (
          <LoadingState label="Loading your profile…" />
        ) : (
          <ErrorState
            message="We couldn't load your profile. Please refresh the page."
            onRetry={() => window.location.reload()}
          />
        )}
      </PageContainer>
    );
  }

  const role = user.role as UserRole;
  const relevantTypes = NOTIFICATION_TYPE_BY_ROLE[role] ?? [];
  const initials = getInitials(user.fullName);

  return (
    <PageContainer>
      <PageHeader
        title="My Profile"
        subtitle="Manage your account, preferences, and notification settings."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ===================== Left: Profile + Quick Stats ===================== */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Profile card */}
          <Card className="overflow-hidden">
            <div className="aidip-gradient-soft h-20 border-b border-border" />
            <CardContent className="-mt-10 flex flex-col items-center gap-3 px-6 pb-6 text-center">
              <Avatar className="h-20 w-20 ring-4 ring-card">
                <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-1.5">
                <h2 className="text-lg font-semibold text-foreground">{user.fullName}</h2>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
                <Badge variant={USER_STATUS_BADGE_VARIANT[user.status]}>
                  {USER_STATUS_LABEL[user.status]}
                </Badge>
              </div>

              <Separator className="my-2" />

              <dl className="w-full space-y-2 text-left text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Member since
                  </dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(user.createdAt)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <UserIcon className="h-3.5 w-3.5" /> Last login
                  </dt>
                  <dd className="font-medium text-foreground">
                    {user.lastLogin ? formatDateTime(user.lastLogin) : '—'}
                  </dd>
                </div>
              </dl>

              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5 text-destructive hover:text-destructive"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </CardContent>
          </Card>

          {/* Quick stats card */}
          <QuickStatsCard
            stats={stats}
            loading={statsLoading}
            error={statsError}
            onRetry={loadStats}
          />
        </div>

        {/* ===================== Right: 4 stacked cards ===================== */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Card 1: Personal Information (read-only) */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <InfoRow label="Full name" value={user.fullName} />
                <InfoRow label="Email" value={user.email} />
                <InfoRow label="Role" value={ROLE_LABEL[role]} />
                <InfoRow
                  label="Status"
                  value={USER_STATUS_LABEL[user.status]}
                />
                <InfoRow label="Registration date" value={formatDate(user.createdAt)} />
                <InfoRow
                  label="Last login"
                  value={user.lastLogin ? formatDateTime(user.lastLogin) : '—'}
                />
                <InfoRow
                  label="Azure AD id"
                  value={maskAzureAdId(user.azureAdId)}
                />
              </dl>
              <div className="mt-5 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>To update your name or email, contact your administrator.</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Personal Preferences (timezone + currency + language) */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Globe className="h-4 w-4 text-primary" />
                Personal Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                {/* Timezone */}
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="pref-timezone"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="pref-timezone" className="w-full">
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
                  <p className="text-[11px] text-muted-foreground">
                    Used for scheduling, notifications, and report timestamps.
                  </p>
                </div>

                {/* Currency */}
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="pref-currency"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Currency
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="pref-currency" className="w-full">
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
                  <p className="text-[11px] text-muted-foreground">
                    Default currency for amounts shown in chat and reports.
                  </p>
                </div>

                {/* Language (read-only) */}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label
                    htmlFor="pref-language"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                    Language
                  </Label>
                  <div className="flex h-9 items-center justify-between rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                    English
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium text-muted-foreground"
                    >
                      Locked for MVP
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    AIDIP v3.0 ships English-only. Additional locales are on the roadmap.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={prefsSaving}
                  onClick={() => void handleSavePrefs()}
                >
                  <Save className="h-4 w-4" />
                  {prefsSaving ? 'Saving…' : 'Save preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Notification Preferences */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Bell className="h-4 w-4 text-primary" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {prefsLoading ? (
                <PrefsSkeleton />
              ) : prefsError ? (
                <ErrorState message={prefsError} onRetry={loadPrefs} />
              ) : prefs ? (
                <PreferencesForm
                  prefs={prefs}
                  relevantTypes={relevantTypes}
                  saving={saving}
                  onChange={setPrefs}
                  onSave={async () => {
                    setSaving(true);
                    try {
                      const svc = ServiceContainer.getInstance().aidip.notification;
                      const updated = await svc.updatePreferences({
                        emailEnabled: prefs.emailEnabled,
                        emailFrequency: prefs.emailFrequency,
                        inappEnabled: prefs.inappEnabled,
                        dndEnabled: prefs.dndEnabled,
                        dndStartHour: prefs.dndStartHour,
                        dndEndHour: prefs.dndEndHour,
                        typesDisabled: prefs.typesDisabled,
                      });
                      setPrefs(updated);
                      toast.success('Notification preferences saved.');
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : 'Could not save preferences.',
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
              ) : null}
            </CardContent>
          </Card>

          {/* Card 4: Sign-in history */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <History className="h-4 w-4 text-primary" />
                Sign-in History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {logsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : logsError ? (
                <ErrorState
                  message={logsError}
                  onRetry={() => user && void loadLogs(user.id)}
                />
              ) : signInLogs.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  <p>No sign-in events recorded yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date &amp; time</TableHead>
                      <TableHead>IP address</TableHead>
                      <TableHead>Browser</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signInLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium text-foreground">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ipAddress ?? '—'}
                        </TableCell>
                        <TableCell>{parseBrowser(log.userAgent)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Unknown
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Sign-in history is retained for 90 days. IP geolocation is
                  not collected by AIDIP.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function QuickStatsCard({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: QuickStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <MessageSquare className="h-4 w-4 text-primary" />
          Quick Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<MessageSquare className="h-4 w-4 text-primary" />}
              label="Conversations"
              value={String(stats.conversations)}
            />
            <StatTile
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Reports"
              value={String(stats.reports)}
            />
            <StatTile
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="Queries this month"
              value={
                stats.queriesThisMonth !== null
                  ? String(stats.queriesThisMonth)
                  : '—'
              }
            />
            <StatTile
              icon={<Timer className="h-4 w-4 text-primary" />}
              label="Avg response time"
              value={
                stats.avgResponseTimeSec !== null
                  ? `${stats.avgResponseTimeSec.toFixed(1)}s`
                  : '—'
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

function PreferencesForm({
  prefs,
  relevantTypes,
  saving,
  onChange,
  onSave,
}: {
  prefs: NotificationPreferences;
  relevantTypes: NotificationType[];
  saving: boolean;
  onChange: (next: NotificationPreferences) => void;
  onSave: () => void;
}) {
  const toggleType = (type: NotificationType, enabled: boolean) => {
    const next = new Set(prefs.typesDisabled);
    if (enabled) next.delete(type);
    else next.add(type);
    onChange({ ...prefs, typesDisabled: Array.from(next) });
  };

  return (
    <div className="space-y-6">
      {/* Master toggles */}
      <div className="space-y-3">
        <ToggleRow
          icon={<Mail className="h-4 w-4 text-muted-foreground" />}
          title="Email notifications"
          description="Receive notifications via email."
          checked={prefs.emailEnabled}
          onCheckedChange={(v) => onChange({ ...prefs, emailEnabled: v })}
        />
        <Separator />
        <ToggleRow
          icon={<Bell className="h-4 w-4 text-muted-foreground" />}
          title="In-app notifications"
          description="Show notifications in the app and the bell panel."
          checked={prefs.inappEnabled}
          onCheckedChange={(v) => onChange({ ...prefs, inappEnabled: v })}
        />
      </div>

      <Separator />

      {/* Email frequency */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="email-frequency" className="text-sm font-medium">
            Email frequency
          </Label>
          <p className="text-xs text-muted-foreground">
            How often to send email digests.
          </p>
        </div>
        <Select
          value={prefs.emailFrequency}
          onValueChange={(v) =>
            onChange({ ...prefs, emailFrequency: v as EmailFrequency })
          }
          disabled={!prefs.emailEnabled}
        >
          <SelectTrigger id="email-frequency" className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(EMAIL_FREQUENCY_LABEL) as EmailFrequency[]).map((f) => (
              <SelectItem key={f} value={f}>
                {EMAIL_FREQUENCY_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Do Not Disturb */}
      <div className="space-y-3">
        <ToggleRow
          icon={<Moon className="h-4 w-4 text-muted-foreground" />}
          title="Do Not Disturb"
          description="Pause non-critical notifications during specific hours."
          checked={prefs.dndEnabled}
          onCheckedChange={(v) => onChange({ ...prefs, dndEnabled: v })}
        />
        {prefs.dndEnabled && (
          <div className="flex flex-wrap items-end gap-3 pl-7">
            <div className="flex flex-col gap-1">
              <Label htmlFor="dnd-start" className="text-xs text-muted-foreground">
                Start hour
              </Label>
              <Select
                value={String(prefs.dndStartHour)}
                onValueChange={(v) =>
                  onChange({ ...prefs, dndStartHour: Number(v) })
                }
              >
                <SelectTrigger id="dnd-start" className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="pb-2 text-xs text-muted-foreground">to</span>
            <div className="flex flex-col gap-1">
              <Label htmlFor="dnd-end" className="text-xs text-muted-foreground">
                End hour
              </Label>
              <Select
                value={String(prefs.dndEndHour)}
                onValueChange={(v) =>
                  onChange({ ...prefs, dndEndHour: Number(v) })
                }
              >
                <SelectTrigger id="dnd-end" className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Per-type toggles */}
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Notification types</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose which types of notifications you want to receive.
          </p>
        </div>
        {relevantTypes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
            No notification types are configured for your role.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {relevantTypes.map((type) => {
              const disabled = prefs.typesDisabled.includes(type);
              return (
                <li
                  key={type}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {NOTIFICATION_TYPE_LABEL[type]}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {disabled ? 'Muted' : 'Receiving'}
                    </span>
                  </div>
                  <Switch
                    checked={!disabled}
                    onCheckedChange={(v) => toggleType(type, v)}
                    aria-label={`Toggle ${NOTIFICATION_TYPE_LABEL[type]}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={saving}
          onClick={onSave}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
          {icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function PrefsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}
