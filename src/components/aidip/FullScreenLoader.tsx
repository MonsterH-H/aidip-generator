/**
 * Full-screen loading indicator — used by route guards.
 */

import { Loader2 } from 'lucide-react';

interface FullScreenLoaderProps {
  label?: string;
}

export function FullScreenLoader({ label = 'Loading…' }: FullScreenLoaderProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M9 22V10h4.5c2.8 0 4.6 1.6 4.6 4.2 0 2.7-1.9 4.3-4.7 4.3h-2.1V22H9zm2.3-5.8h2c1.5 0 2.4-.8 2.4-2 0-1.3-.9-2-2.4-2h-2v4z" />
          <circle cx="22" cy="11" r="2" />
          <path d="M20 22v-7h4v7h-4z" />
        </svg>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}
