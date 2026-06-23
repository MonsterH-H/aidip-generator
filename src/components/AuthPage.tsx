/**
 * AIDIP Auth Page — premium SSO-first sign-in experience.
 *
 * Per CDC §4 (Module 1) and CDC §3 Rule 2 (Zero password):
 *   - In Fabric production mode: a single "Sign in with Microsoft" button.
 *   - In local development (API URL on localhost): a username/password
 *     form is also offered, powered by the Rayfin experimental password
 *     auth provider. This is the original auth flow preserved from the
 *     scaffold.
 *
 * Access is invitation-only — no self-registration. The descriptive
 * copy under the buttons makes this explicit.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, ShieldCheck, Sparkles } from 'lucide-react';

import { useAuth } from '@/hooks/AuthContext';
import { AIDIP_BRAND } from '@/lib/aidip/constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AuthPage() {
  const { signIn, signInWithFabric, fabricAuthEnabled, usernameAuthEnabled } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'fabric' | 'password' | null>(null);

  const handleFabricSignIn = async () => {
    setError(null);
    setLoading('fabric');
    try {
      await signInWithFabric();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Microsoft.');
      setLoading(null);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading('password');
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
      setLoading(null);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-chart-3/10 blur-3xl" />

      <div className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:items-center">
        {/* ====================== Brand panel ====================== */}
        <div className="hidden flex-col gap-6 px-8 lg:flex">
          <div className="flex items-center gap-3">
            <AidipLogo />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-tight">{AIDIP_BRAND.name}</span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {AIDIP_BRAND.tagline}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Talk to your data.
              <br />
              <span className="text-primary">In natural language.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              AIDIP turns business questions into live Microsoft Fabric answers —
              no DAX, no SQL, no Power BI expertise required. Reports are
              always live, exports are one click away, and your data never
              leaves your Microsoft tenant.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 pt-2">
            {[
              { icon: Sparkles, title: 'Conversational BI', text: 'Ask in plain English, get structured answers' },
              { icon: ShieldCheck, title: 'Zero data exfiltration', text: 'All data stays in your Fabric workspace' },
              { icon: LogIn, title: 'Microsoft Entra ID SSO', text: 'Sign in with your corporate account' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-3 backdrop-blur">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{f.title}</span>
                  <span className="text-xs text-muted-foreground">{f.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ====================== Sign-in card ====================== */}
        <Card className="mx-auto w-full max-w-md shadow-lg">
          <CardHeader className="space-y-3 text-center">
            <div className="flex justify-center lg:hidden">
              <AidipLogo />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold tracking-tight">
                Sign in to {AIDIP_BRAND.name}
              </CardTitle>
              <CardDescription className="text-xs">
                Access is by invitation only. Contact your administrator if you don't have an account.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Microsoft SSO button — primary entry per CDC §4 */}
            {fabricAuthEnabled && (
              <Button
                type="button"
                onClick={handleFabricSignIn}
                disabled={loading !== null}
                className="w-full gap-2 bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90"
                size="lg"
              >
                {loading === 'fabric' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MicrosoftLogo className="h-4 w-4" />
                )}
                Sign in with Microsoft
              </Button>
            )}

            {/* Local development — username/password (Rayfin experimental) */}
            {usernameAuthEnabled && (
              <>
                {fabricAuthEnabled && (
                  <div className="relative">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      or local account
                    </span>
                  </div>
                )}
                <form onSubmit={handlePasswordSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading !== null}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading !== null}
                      className="h-10"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading !== null}
                    className="h-10 w-full gap-2"
                    size="lg"
                  >
                    {loading === 'password' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>Sign in</>
                    )}
                  </Button>
                </form>
              </>
            )}

            {!fabricAuthEnabled && !usernameAuthEnabled && (
              <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-3 text-xs text-warning-foreground">
                No authentication method is configured. Ask your administrator to deploy AIDIP via <code className="font-mono">rayfin up</code> to enable Microsoft Entra ID SSO.
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="pt-2 text-center">
              <p className="text-[11px] text-muted-foreground">
                © 2026 {AIDIP_BRAND.vendor}. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function AidipLogo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M9 22V10h4.5c2.8 0 4.6 1.6 4.6 4.2 0 2.7-1.9 4.3-4.7 4.3h-2.1V22H9zm2.3-5.8h2c1.5 0 2.4-.8 2.4-2 0-1.3-.9-2-2.4-2h-2v4z" />
        <circle cx="22" cy="11" r="2" />
        <path d="M20 22v-7h4v7h-4z" />
      </svg>
    </div>
  );
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
