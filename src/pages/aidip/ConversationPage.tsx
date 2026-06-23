/**
 * AIDIP ConversationPage — Module 3 active conversation route (CDC §6.3.2).
 *
 * Route: `/chat/:conversationId`
 *
 * Two-column layout: conversation sidebar + scrollable message thread with
 * the chat input pinned at the bottom. Each assistant message renders the
 * 5-part CDC §6.3.2 contract: explanatory text → visualization → table →
 * insights → action bar.
 *
 * Streaming: a new user message is shown optimistically, then an assistant
 * bubble shows a "Generating…" indicator while the server-side pipeline
 * (validation → intent → DAX → DAB → guardrail → formatting → save)
 * runs and returns the complete structured response. The "Stop" button
 * cancels the local wait — the server call completes asynchronously and
 * its result is discarded on the client.
 *
 * Anti-hallucination (CDC §3 Rule 6): when `errorKind === 'empty_data'` the
 * assistant message renders ONLY the "No data was found…" text — no chart,
 * no table, no insights, no action bar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCheck,
  ChevronLeft,
  Copy,
  Download,
  FilePlus2,
  Lightbulb,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  ChatFeedback,
  ChatInsight,
  ChatMessage,
  ChatTableColumn,
  ChatTableData,
  ChatVisualization,
  Conversation,
} from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
} from '@/lib/aidip/format';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { ChatInputBox } from '@/components/aidip/ChatInputBox';
import { ConversationSidebar } from '@/components/aidip/ConversationSidebar';

/* ----------------------------------------------------------------------------
   Chart palette (CDC §6.3.2)
---------------------------------------------------------------------------- */
const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/* ----------------------------------------------------------------------------
   ConversationPage
---------------------------------------------------------------------------- */

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAidipSession();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const cancelRef = useRef(false);
  const initialMessageRef = useRef<string | null>(
    (location.state as { initialMessage?: string } | null)?.initialMessage ?? null,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim()) return;
      const trimmed = text.trim();

      // Optimistic user message — replaced on completion with the real one.
      const optimisticUser: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        userId: user?.id ?? '',
        role: 'user',
        contentText: trimmed,
        contentJson: null,
        daxQuery: null,
        tokensUsed: null,
        modelUsed: null,
        responseTimeMs: null,
        feedback: null,
        feedbackReason: null,
        errorKind: null,
        createdAt: new Date().toISOString(),
      };

      cancelRef.current = false;
      setIsGenerating(true);
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const result = await ServiceContainer.getInstance().aidip.chat.sendMessage({
          conversationId,
          text: trimmed,
        });

        if (cancelRef.current) {
          // User cancelled — discard the final result.
          return;
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUser.id),
          result.userMessage,
          result.assistantMessage,
        ]);
        setSidebarRefreshKey((k) => k + 1);
      } catch (err) {
        console.error('Chat send failed', err);
        if (cancelRef.current) return;
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          conversationId,
          userId: user?.id ?? '',
          role: 'assistant',
          contentText: "I'm having trouble connecting right now.",
          contentJson: { text: "I'm having trouble connecting right now." },
          daxQuery: null,
          tokensUsed: null,
          modelUsed: null,
          responseTimeMs: null,
          feedback: null,
          feedbackReason: null,
          errorKind: 'fabric_unavailable',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUser.id),
          {
            ...optimisticUser,
            id: `real-${Date.now()}`,
          },
          errorMessage,
        ]);
        setSidebarRefreshKey((k) => k + 1);
      } finally {
        if (!cancelRef.current) {
          setIsGenerating(false);
        }
      }
    },
    [conversationId, user?.id],
  );

  // Load conversation + messages on mount / when conversationId changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!conversationId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const svc = ServiceContainer.getInstance().aidip;
        const conv = await svc.conversation.get(conversationId);
        if (cancelled) return;
        if (!conv) {
          navigate('/chat', { replace: true });
          return;
        }
        setConversation(conv);
        const msgs = await svc.chat.listMessages(conversationId);
        if (cancelled) return;
        setMessages(msgs);

        if (initialMessageRef.current && msgs.length === 0) {
          const text = initialMessageRef.current;
          initialMessageRef.current = null;
          void send(text);
        }
      } catch (err) {
        console.error('Failed to load conversation', err);
        if (!cancelled) setLoadError('Failed to load this conversation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, navigate, send]);

  // Auto-scroll to bottom when new content arrives.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isGenerating]);

  function handleCancel() {
    cancelRef.current = true;
    setIsGenerating(false);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isGenerating) return;
    setInput('');
    void send(text);
  }

  function handleRegenerate(text: string) {
    if (isGenerating || !text) return;
    void send(text);
  }

  async function handleFeedback(
    messageId: string,
    feedback: ChatFeedback,
    reason?: string,
  ) {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, feedback, feedbackReason: reason ?? null }
          : m,
      ),
    );
    try {
      await ServiceContainer.getInstance().aidip.chat.setFeedback(
        messageId,
        feedback ?? 'positive',
        reason,
      );
      toast.success(feedback === 'positive' ? 'Thanks for your feedback!' : 'Thanks — we\'ll use this to improve.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to record feedback.');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, feedback: null, feedbackReason: null } : m,
        ),
      );
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-var(--header-height))] overflow-hidden">
        <ConversationSidebar activeId={conversationId} refreshKey={sidebarRefreshKey} />
        <section className="flex flex-1 items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading conversation…
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-[calc(100dvh-var(--header-height))] overflow-hidden">
        <ConversationSidebar activeId={conversationId} refreshKey={sidebarRefreshKey} />
        <section className="flex flex-1 items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-6 w-6 text-warning" />
            <p className="text-sm text-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/chat')}>
              Back to chat
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <ConversationSidebar activeId={conversationId} refreshKey={sidebarRefreshKey} />

      <section className="flex flex-1 flex-col overflow-hidden bg-background">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate('/chat')}
            aria-label="Back to all conversations"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {conversation?.title ?? 'Conversation'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'} ·{' '}
              {conversation ? formatRelativeTime(conversation.lastMessageAt) : '—'}
            </span>
          </div>
          {isGenerating && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-2.5 py-1 text-[11px] font-medium text-primary-subtle-foreground">
              <span className="aidip-status-dot bg-primary animate-pulse" />
              Generating…
            </span>
          )}
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.length === 0 && !isGenerating && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground">
                  Send a message below to start this conversation.
                </p>
              </div>
            )}

            {messages.map((m, i) => {
              const previousUserText = findPreviousUserText(messages, i);
              if (m.role === 'user') {
                return <UserBubble key={m.id} message={m} />;
              }
              return (
                <AssistantBubble
                  key={m.id}
                  message={m}
                  previousUserText={previousUserText}
                  onRegenerate={handleRegenerate}
                  onFeedback={handleFeedback}
                  isGenerating={isGenerating}
                />
              );
            })}

            {isGenerating && <GeneratingBubble />}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <ChatInputBox
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onCancel={handleCancel}
              disabled={isGenerating || !conversation}
              isGenerating={isGenerating}
              placeholder={
                isGenerating
                  ? 'Generating response…'
                  : 'Ask a follow-up question…'
              }
            />
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              AIDIP answers only from your authorized semantic models. Press
              <kbd className="mx-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">Enter</kbd>
              to send,
              <kbd className="mx-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">Esc</kbd>
              to stop.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Helpers
---------------------------------------------------------------------------- */

function findPreviousUserText(messages: ChatMessage[], assistantIndex: number): string | null {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return m.contentText;
  }
  return null;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Minimal markdown renderer: handles **bold** and preserves whitespace. */
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Serialize an inline SVG chart to a PNG download. */
function downloadChartPng(containerEl: HTMLDivElement | null, filename: string) {
  if (!containerEl) return;
  const svg = containerEl.querySelector('svg');
  if (!svg) {
    toast.error('Chart not ready for download.');
    return;
  }
  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const width = (svg.getBoundingClientRect().width || 800) * scale;
    const height = (svg.getBoundingClientRect().height || 400) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(pngUrl);
      toast.success('Chart PNG downloaded.');
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast.error('Failed to render chart for download.');
  };
  img.src = url;
}

/* ----------------------------------------------------------------------------
   User bubble
---------------------------------------------------------------------------- */

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col items-end gap-1 self-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
        <p className="whitespace-pre-wrap break-words text-sm">{message.contentText}</p>
      </div>
      <div className="flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
        <span>{formatTime(message.createdAt)}</span>
        <CheckCheck className="h-3 w-3 text-primary/70" aria-label="Sent" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Streaming bubble
---------------------------------------------------------------------------- */

function GeneratingBubble() {
  return (
    <div className="flex gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary-subtle text-[10px] font-semibold text-primary-subtle-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Generating response…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Assistant bubble — 5-part CDC §6.3.2 contract
---------------------------------------------------------------------------- */

interface AssistantBubbleProps {
  message: ChatMessage;
  previousUserText: string | null;
  onRegenerate: (text: string) => void;
  onFeedback: (messageId: string, feedback: ChatFeedback, reason?: string) => void;
  isGenerating: boolean;
}

function AssistantBubble({
  message,
  previousUserText,
  onRegenerate,
  onFeedback,
  isGenerating,
}: AssistantBubbleProps) {
  const content = message.contentJson;
  const isEmptyData = message.errorKind === 'empty_data';
  const isNetworkError =
    message.errorKind === 'fabric_unavailable' ||
    message.errorKind === 'ai_unavailable' ||
    message.errorKind === 'timeout';

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ChatVisualization | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState<string>('');

  function handleCopy() {
    const text = content?.text ?? message.contentText;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Copied to clipboard.'))
      .catch(() => toast.error('Failed to copy.'));
  }

  function handleRegenerate() {
    if (!previousUserText) {
      toast.error('No previous question to regenerate.');
      return;
    }
    onRegenerate(previousUserText);
  }

  function handlePositive() {
    onFeedback(message.id, 'positive');
  }

  function handleNegativeSubmit() {
    onFeedback(message.id, 'negative', feedbackReason || undefined);
    setFeedbackDialogOpen(false);
    setFeedbackReason('');
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary-subtle text-[10px] font-semibold text-primary-subtle-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex max-w-[85%] flex-col gap-1">
        <div
          className={cn(
            'rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-sm',
            isEmptyData ? 'border-warning/30 bg-warning-subtle/40' : 'border-border',
            isNetworkError && 'border-destructive/30 bg-destructive-subtle/40',
          )}
        >
          {/* ----- 1. Source citation (non-error only) ----- */}
          {!isEmptyData && !isNetworkError && content?.sourceCitation && (
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary-subtle-foreground">
              <Sparkles className="h-3 w-3" />
              {content.sourceCitation}
            </div>
          )}

          {/* ----- 1b. Explanatory text (always) ----- */}
          <div
            className={cn(
              'whitespace-pre-wrap break-words text-sm',
              isEmptyData
                ? 'font-medium text-warning'
                : isNetworkError
                  ? 'text-destructive'
                  : 'text-foreground',
            )}
          >
            {renderMarkdown(content?.text ?? message.contentText)}
          </div>

          {/* ----- Network error: retry button ----- */}
          {isNetworkError && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={isGenerating || !previousUserText}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          )}

          {/* ----- 2. Visualization ----- */}
          {!isEmptyData && !isNetworkError && content?.visualization && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">
                  {content.visualization.title}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                  onClick={() => setExpanded(content.visualization!)}
                >
                  <Maximize2 className="h-3 w-3" /> Expand
                </Button>
              </div>
              <div ref={chartContainerRef}>
                <ChartRenderer visualization={content.visualization} />
              </div>
              {content.visualization.source && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Source: {content.visualization.source}
                </p>
              )}
            </div>
          )}

          {/* ----- 3. Data table ----- */}
          {!isEmptyData && !isNetworkError && content?.table && (
            <div className="mt-3 border-t border-border pt-3">
              <DataTableSection data={content.table} />
            </div>
          )}

          {/* ----- 4. Insights ----- */}
          {!isEmptyData && !isNetworkError && content?.insights && content.insights.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <InsightsSection insights={content.insights} />
            </div>
          )}

          {/* ----- 5. Action bar (non-error only) ----- */}
          {!isEmptyData && !isNetworkError && (
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
              <ActionButton onClick={handleRegenerate} disabled={isGenerating || !previousUserText} label="Regenerate" icon={RefreshCw} />
              <ActionButton onClick={handleCopy} label="Copy" icon={Copy} />
              <ActionButton to="/reports/new" label="Add to Report" icon={FilePlus2} />
              {content?.visualization && (
                <ActionButton
                  onClick={() => downloadChartPng(chartContainerRef.current, 'aidip-chart.png')}
                  label="PNG"
                  icon={Download}
                />
              )}
              <div className="ml-auto flex items-center gap-1">
                <FeedbackButton
                  active={message.feedback === 'positive'}
                  onClick={handlePositive}
                  disabled={isGenerating}
                  icon={ThumbsUp}
                  label="Helpful"
                />
                <FeedbackButton
                  active={message.feedback === 'negative'}
                  onClick={() => setFeedbackDialogOpen(true)}
                  disabled={isGenerating}
                  icon={ThumbsDown}
                  label="Not helpful"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer: time + model + response time */}
        <div className="flex items-center gap-1.5 pl-1 text-[10px] text-muted-foreground">
          <span>{formatTime(message.createdAt)}</span>
          {message.modelUsed && <span>· {message.modelUsed}</span>}
          {message.responseTimeMs != null && (
            <span>· {(message.responseTimeMs / 1000).toFixed(1)}s</span>
          )}
          {message.tokensUsed != null && <span>· {formatNumber(message.tokensUsed)} tok</span>}
        </div>
      </div>

      {/* Expand chart modal */}
      <Dialog open={expanded !== null} onOpenChange={(o) => { if (!o) setExpanded(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base">{expanded?.title}</DialogTitle>
            <DialogDescription>{expanded?.source}</DialogDescription>
          </DialogHeader>
          <div className="h-[480px] w-full">
            {expanded && <ChartRenderer visualization={expanded} height={480} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Negative feedback dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What went wrong?</DialogTitle>
            <DialogDescription>
              Your feedback helps us improve AIDIP&apos;s responses.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {FEEDBACK_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  feedbackReason === r
                    ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="feedback-reason"
                  value={r}
                  checked={feedbackReason === r}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  className="h-3.5 w-3.5"
                />
                {r}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNegativeSubmit}>Submit feedback</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FEEDBACK_REASONS = [
  'Not relevant to my question',
  'Incorrect or misleading',
  'Missing important detail',
  'Chart or table is wrong',
  'Other',
];

/* ----------------------------------------------------------------------------
   Action buttons
---------------------------------------------------------------------------- */

function ActionButton({
  onClick,
  label,
  icon: Icon,
  disabled,
  to,
}: {
  onClick?: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  to?: string;
}) {
  const className = cn(
    'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    disabled && 'pointer-events-none opacity-50',
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        <Icon className="h-3 w-3" />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function FeedbackButton({
  active,
  onClick,
  disabled,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-primary-subtle text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ----------------------------------------------------------------------------
   Chart renderer
---------------------------------------------------------------------------- */

function ChartRenderer({
  visualization,
  height = 260,
}: {
  visualization: ChatVisualization;
  height?: number;
}) {
  const data = visualization.series;
  const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' };

  if (visualization.type === 'kpi') {
    const first = data[0];
    const second = data[1];
    return (
      <KpiView
        title={visualization.title}
        value={first?.value ?? 0}
        comparisonValue={second?.value}
        comparisonLabel={second?.label}
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {visualization.type === 'line' ? (
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke="var(--border)" />
          <YAxis tick={axisTick} stroke="var(--border)" />
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--chart-1)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      ) : visualization.type === 'area' ? (
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="aidip-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke="var(--border)" />
          <YAxis tick={axisTick} stroke="var(--border)" />
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#aidip-area-fill)"
          />
        </AreaChart>
      ) : visualization.type === 'bar' ? (
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke="var(--border)" />
          <YAxis tick={axisTick} stroke="var(--border)" />
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      ) : (
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={Math.min(110, height / 2 - 30)}
            innerRadius={Math.min(60, height / 2 - 60)}
            paddingAngle={1}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}

function KpiView({
  title,
  value,
  comparisonValue,
  comparisonLabel,
}: {
  title: string;
  value: number;
  comparisonValue?: number;
  comparisonLabel?: string;
}) {
  const trend = comparisonValue != null && value != null ? value - comparisonValue : null;
  const trendUp = trend != null && trend >= 0;
  return (
    <div className="flex items-end gap-4 rounded-md border border-border bg-surface-muted px-4 py-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {formatNumber(value)}
        </div>
      </div>
      {trend != null && (
        <div className="flex flex-col items-start gap-0.5 pb-1">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-sm font-semibold',
              trendUp ? 'text-success' : 'text-destructive',
            )}
          >
            {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {trend > 0 ? '+' : ''}
            {formatNumber(trend)}
          </span>
          {comparisonLabel && (
            <span className="text-[10px] text-muted-foreground">vs {comparisonLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Data table
---------------------------------------------------------------------------- */

const TABLE_PAGE_SIZE = 20;

function DataTableSection({ data }: { data: ChatTableData }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return data.rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data.rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * TABLE_PAGE_SIZE, (safePage + 1) * TABLE_PAGE_SIZE);

  function toggleSort(col: string) {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
    setPage(0);
  }

  function formatCell(value: string | number, col: ChatTableColumn): string {
    if (typeof value === 'number') {
      if (col.format === 'currency') return formatCurrency(value);
      if (col.format === 'percent') return `${value.toFixed(1)}%`;
      if (col.format === 'integer') return formatNumber(value);
    }
    return String(value);
  }

  function downloadCsv() {
    const headers = data.columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const rows = data.rows.map((r) =>
      data.columns
        .map((c) => {
          const v = r[c.key];
          if (typeof v === 'number') return v;
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aidip-data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded.');
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          Data table · {data.rows.length} of {data.totalRows} rows
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={downloadCsv}
        >
          <Download className="h-3 w-3" /> Download CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {data.columns.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="cursor-pointer select-none px-3 text-[11px] font-semibold uppercase tracking-wide hover:bg-muted"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sort?.col === c.key && (
                      <span className="text-primary">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => (
              <TableRow key={i}>
                {data.columns.map((c) => (
                  <TableCell key={c.key} className="px-3 py-2 text-xs">
                    {formatCell(row[c.key] ?? '', c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Page {safePage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Insights
---------------------------------------------------------------------------- */

function InsightsSection({ insights }: { insights: ChatInsight[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        AI Insights
      </span>
      <ul className="flex flex-col gap-1.5">
        {insights.map((ins, i) => {
          const Icon = ins.kind === 'trend' ? TrendingUp : ins.kind === 'anomaly' ? AlertTriangle : Lightbulb;
          const color =
            ins.kind === 'trend'
              ? 'text-success'
              : ins.kind === 'anomaly'
                ? 'text-warning'
                : 'text-primary';
          return (
            <li key={i} className="flex items-start gap-2">
              <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center', color)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs text-foreground">
                <span className={cn('mr-1 font-semibold uppercase tracking-wide', color)}>
                  {ins.kind}:
                </span>
                {ins.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
