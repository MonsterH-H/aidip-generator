/**
 * Global search modal — Cmd+K spotlight-style search across
 * conversations, reports, and exports.
 *
 * Per CDC §11.2 (Module 9): full-text search with operator support
 * (type:, date:, title:, exact phrases, exclusions).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MessageSquare, Download, Search as SearchIcon, X } from 'lucide-react';

import type { SearchResultType, SearchResult } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS: { value: SearchResultType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'conversation', label: 'Conversations' },
  { value: 'report', label: 'Reports' },
  { value: 'export', label: 'Exports' },
];

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchResultType | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();

  // Debounced search
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const svc = ServiceContainer.getInstance().aidip.search;
        const type = tab === 'all' ? undefined : tab;
        const res = await svc.search(query, { type });
        setResults(res);
      } finally {
        setLoading(false);
        setActiveIndex(0);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, tab]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        navigateAndClose(results[activeIndex]!.actionUrl);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, activeIndex]);

  function navigateAndClose(url: string) {
    onOpenChange(false);
    navigate(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Global search</DialogTitle>
          <DialogDescription>Search conversations, reports, and exports.</DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, reports, exports…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Tabs */}
        <div className="border-b border-border px-3 py-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="bg-transparent">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Results */}
        <div className="max-h-[400px] min-h-[200px] overflow-y-auto p-2">
          {loading && (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && query.length < 2 && (
            <EmptyState
              title="Start typing to search"
              description="Search operators: &quot;text&quot; · -exclude · type:report · date:YYYY-MM-DD..YYYY-MM-DD · title:..."
            />
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <EmptyState
              title="No results found"
              description={`No items match "${query}" in your accessible scope.`}
            />
          )}

          {!loading && results.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {results.map((r, idx) => {
                const Icon = RESULT_ICONS[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigateAndClose(r.actionUrl)}
                      className={[
                        'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors',
                        idx === activeIndex ? 'bg-primary-subtle' : 'hover:bg-muted',
                      ].join(' ')}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{r.title}</span>
                          <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase">
                            {r.type}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{r.excerpt}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_ICONS: Record<SearchResultType, typeof FileText> = {
  conversation: MessageSquare,
  report: FileText,
  export: Download,
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <SearchIcon className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p
        className="text-xs text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </div>
  );
}
