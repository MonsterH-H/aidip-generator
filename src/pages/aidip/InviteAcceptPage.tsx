/**
 * AIDIP Invitation Accept page — public route.
 *
 * Reads `?token=` from the URL and validates it on mount. Shows one of:
 *   - Loading spinner
 *   - Invalid / expired error card
 *   - Valid invitation details with Accept / Decline actions
 *
 * On successful accept, redirects to /auth with a confirmation message so the
 * user can sign in with their Microsoft account.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  UserCog,
  MessageSquareQuote,
  Mail,
  X,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Invitation } from '@/lib/aidip/types';
import { ROLE_LABEL } from '@/lib/aidip/types';
import {
  AIDIP_BRAND,
  ROLE_BADGE_VARIANT,
} from '@/lib/aidip/constants';
import { formatDate } from '@/lib/aidip/format';
import { ServiceContainer } from '@/services/ServiceContainer';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'valid'; invitation: Invitation };

export function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    async function run() {
      if (!token) {
        if (!cancelled) {
          setState({
            kind: 'invalid',
            reason: 'No invitation token was found in the link. Please use the link from your invitation email.',
          });
        }
        return;
      }
      try {
        const svc = ServiceContainer.getInstance().aidip.invitation;
        const result = await svc.validateToken(token);
        if (cancelled) return;
        if (result.valid && result.invitation) {
          setState({ kind: 'valid', invitation: result.invitation });
        } else {
          setState({
            kind: 'invalid',
            reason: result.reason ?? 'This invitation could not be validated.',
          });
        }
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: 'invalid',
          reason:
            e instanceof Error
              ? e.message
              : 'We could not validate this invitation. Please try again later.',
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.invitation;
      const result = await svc.accept(token);
      if (result.ok) {
        toast.success('Invitation accepted. Welcome to AIDIP!');
        const invitation =
          state.kind === 'valid' ? state.invitation : null;
        const email = invitation?.email ?? '';
        const message = email
          ? `Thanks for accepting — please sign in with your Microsoft account (${email}).`
          : 'Thanks for accepting — please sign in with your Microsoft account.';
        navigate(`/auth?message=${encodeURIComponent(message)}`);
      } else {
        toast.error(result.message ?? 'Could not accept invitation.');
        setState({
          kind: 'invalid',
          reason: result.message ?? 'Could not accept invitation.',
        });
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not accept invitation.',
      );
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    navigate('/auth');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Premium gradient background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(0, 120, 212, 0.10), transparent 55%), linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)',
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-32 -top-32 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 -z-10 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="w-full max-w-lg">
        {/* AIDIP branding */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <img
            src="/aidip.svg"
            alt={`${AIDIP_BRAND.name} logo`}
            className="h-12 w-12 shadow-sm"
            width={48}
            height={48}
          />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-base font-semibold tracking-tight text-foreground">
              {AIDIP_BRAND.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {AIDIP_BRAND.tagline}
            </span>
          </div>
        </div>

        {/* State: Loading */}
        {state.kind === 'loading' && (
          <Card className="shadow-md">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Validating your invitation…
              </p>
            </CardContent>
          </Card>
        )}

        {/* State: Invalid / Expired */}
        {state.kind === 'invalid' && (
          <Card className="shadow-md">
            <CardContent className="flex flex-col items-center gap-4 px-6 py-8 text-center sm:px-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning-subtle text-warning">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Invitation unavailable
                </h1>
                <p className="text-sm text-muted-foreground">{state.reason}</p>
              </div>
              <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                Please contact your administrator if you believe this is an error.
              </div>
              <Button asChild className="mt-2 w-full gap-1.5">
                <Link to="/auth">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* State: Valid */}
        {state.kind === 'valid' && (
          <Card className="shadow-md">
            <CardContent className="flex flex-col gap-5 px-6 py-7 sm:px-8">
              {/* Header */}
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    You've been invited to join AIDIP
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Review the details below and accept to get started.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Invitation details */}
              <dl className="space-y-4">
                <DetailRow
                  icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                  label="Invited email"
                  value={state.invitation.email}
                />
                <DetailRow
                  icon={<UserCog className="h-4 w-4 text-muted-foreground" />}
                  label="Invited by"
                  value={state.invitation.invitedByName}
                />
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Assigned role
                    </dt>
                    <dd>
                      <Badge variant={ROLE_BADGE_VARIANT[state.invitation.role]}>
                        {ROLE_LABEL[state.invitation.role]}
                      </Badge>
                    </dd>
                  </div>
                </div>
                <DetailRow
                  icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                  label="Expires"
                  value={formatDate(state.invitation.expiresAt)}
                />
              </dl>

              {/* Personal message */}
              {state.invitation.personalMessage && (
                <>
                  <Separator />
                  <figure className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-4 py-3">
                    <figcaption className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <MessageSquareQuote className="h-3.5 w-3.5" />
                      Personal message
                    </figcaption>
                    <blockquote className="text-sm italic text-foreground">
                      “{state.invitation.personalMessage}”
                    </blockquote>
                  </figure>
                </>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={handleDecline}
                  disabled={accepting}
                >
                  <X className="h-4 w-4" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleAccept()}
                  disabled={accepting}
                >
                  {accepting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Accepting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Accept Invitation
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          By accepting this invitation you agree to the {AIDIP_BRAND.name} terms of service.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
