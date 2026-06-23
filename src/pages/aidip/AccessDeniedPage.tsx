/**
 * AIDIP Access Denied page — public route (no auth required).
 *
 * Reached when a user is suspended, fails email verification, follows an
 * invalid/expired invitation, or attempts to access a forbidden resource.
 * Reads `?reason=` from the URL and renders an appropriate message.
 */

import { Link, useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  ShieldAlert,
  MailX,
  Clock,
  KeyRound,
  Lock,
  type LucideIcon,
} from 'lucide-react';

import { AIDIP_BRAND } from '@/lib/aidip/constants';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Reason =
  | 'suspended'
  | 'email_mismatch'
  | 'invitation_invalid'
  | 'invitation_expired'
  | 'forbidden';

interface ReasonConfig {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon container background. */
  iconClass: string;
}

const REASON_CONFIG: Record<Reason, ReasonConfig> = {
  suspended: {
    title: 'Your account has been suspended',
    description:
      'Your access to AIDIP has been suspended by an administrator. Please contact your company administrator or our support team to restore access.',
    icon: Ban,
    iconClass: 'bg-destructive-subtle text-destructive',
  },
  email_mismatch: {
    title: 'Email mismatch',
    description:
      'The Microsoft account you signed in with does not match the email address on your invitation. Please sign in with the email address that received the invitation.',
    icon: MailX,
    iconClass: 'bg-warning-subtle text-warning',
  },
  invitation_invalid: {
    title: 'Invalid invitation',
    description:
      'This invitation link is invalid or has already been used. Please request a new invitation from your administrator.',
    icon: KeyRound,
    iconClass: 'bg-warning-subtle text-warning',
  },
  invitation_expired: {
    title: 'Invitation expired',
    description:
      'This invitation link has expired. Please contact your administrator to request a new invitation.',
    icon: Clock,
    iconClass: 'bg-warning-subtle text-warning',
  },
  forbidden: {
    title: 'Access denied',
    description:
      "You don't have permission to access this page. If you believe this is an error, please contact your administrator.",
    icon: ShieldAlert,
    iconClass: 'bg-destructive-subtle text-destructive',
  },
};

function resolveReason(value: string | null): Reason {
  if (value && value in REASON_CONFIG) return value as Reason;
  return 'forbidden';
}

export function AccessDeniedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reason = resolveReason(searchParams.get('reason'));
  const config = REASON_CONFIG[reason];
  const Icon = config.icon;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Subtle decorative gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(0, 120, 212, 0.06), transparent 55%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        }}
        aria-hidden="true"
      />

      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <img
            src="/aidip.svg"
            alt={`${AIDIP_BRAND.name} logo`}
            className="h-10 w-10"
            width={40}
            height={40}
          />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {AIDIP_BRAND.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {AIDIP_BRAND.tagline}
            </span>
          </div>
        </div>

        <Card className="shadow-md">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-8 text-center sm:px-8">
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full',
                config.iconClass,
              )}
            >
              <Icon className="h-7 w-7" aria-hidden="true" />
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {config.title}
              </h1>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </div>

            <div className="mt-2 flex w-full flex-col gap-2">
              <Button
                className="w-full gap-1.5"
                onClick={() => navigate('/auth')}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Button>
              <Button asChild variant="link" size="sm" className="text-xs text-muted-foreground">
                <Link to="/auth">
                  <Lock className="h-3 w-3" />
                  Use a different account
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Need help? Email{' '}
          <a
            href={`mailto:${AIDIP_BRAND.supportEmail}`}
            className="font-medium text-primary hover:underline"
          >
            {AIDIP_BRAND.supportEmail}
          </a>
        </p>
      </div>
    </div>
  );
}
