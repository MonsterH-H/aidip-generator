/**
 * AIDIP premium 404 page.
 *
 * Route: `*` (any unmatched authenticated or unauthenticated path).
 *
 * Centered card with a large gradient "404" header, the AIDIP logo,
 * title + subtitle, and two CTAs: back to dashboard (for signed-in users)
 * and back to sign in.
 *
 * Premium enterprise styling aligned with Azure Portal error pages.
 */

import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';

import { AIDIP_BRAND } from '@/lib/aidip/constants';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Subtle decorative gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(0, 120, 212, 0.08), transparent 55%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
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
            {/* Large gradient "404" */}
            <div
              className="aidip-gradient-azure bg-clip-text text-7xl font-bold tracking-tight text-transparent"
              aria-hidden="true"
            >
              404
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Page not found
              </h1>
              <p className="text-sm text-muted-foreground">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <div className="mt-2 flex w-full flex-col gap-2">
              <Button
                className="w-full gap-1.5"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                <Link to="/auth">
                  <LogIn className="h-4 w-4" />
                  Back to sign in
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
