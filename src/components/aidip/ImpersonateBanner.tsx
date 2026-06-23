/**
 * Impersonation banner — permanently visible red banner shown when a
 * Super Admin is impersonating a client user. Per CDC §5 (Module 2),
 * the banner must be visible at all times during impersonation, and
 * must display the target user's email + a clear "all actions are
 * logged" warning.
 *
 * Includes a one-click "End impersonation" action.
 */

import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

import type { ImpersonationSession } from '@/lib/aidip/types';

import { ServiceContainer } from '@/services/ServiceContainer';

import { Button } from '@/components/ui/button';

interface ImpersonateBannerProps {
  session: ImpersonationSession;
}

export function ImpersonateBanner({ session }: ImpersonateBannerProps) {
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      const expiresAt = new Date(session.expiresAt).getTime();
      setRemainingSeconds(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [session.expiresAt]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await ServiceContainer.getInstance().aidip.impersonation.end();
      // Force a full reload of the session by navigating to the super-admin dashboard
      navigate('/super-admin/dashboard');
      window.location.reload();
    } finally {
      setEnding(false);
    }
  };

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-destructive/30 bg-destructive px-4 py-2 text-destructive-foreground"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">
        You are viewing as <strong>{session.targetUserEmail}</strong>
      </span>
      <span className="hidden text-xs opacity-90 sm:inline">
        — All actions are logged.
      </span>
      <span className="hidden text-xs opacity-75 md:inline">
        Reason: "{session.reason.slice(0, 80)}{session.reason.length > 80 ? '…' : ''}"
      </span>
      <span className="ml-auto flex items-center gap-3">
        {remainingSeconds > 0 ? (
          <span className="text-xs tabular-nums opacity-90">
            Auto-ends in {mins}:{String(secs).padStart(2, '0')}
          </span>
        ) : (
          <span className="text-xs font-semibold">Session expired</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 bg-white/15 px-2.5 text-xs text-white hover:bg-white/25"
          onClick={handleEnd}
          disabled={ending}
        >
          <X className="h-3.5 w-3.5" />
          End impersonation
        </Button>
      </span>
    </div>
  );
}
