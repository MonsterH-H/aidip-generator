/**
 * AIDIP ChatPage — Module 3 landing route (CDC §6.3.1).
 *
 * Route: `/chat`
 *
 * Shows the conversation sidebar (left, 250px) + a centered welcome screen
 * with a personalized greeting, dynamic starter suggestions (sourced from the
 * Rayfin `getChatSuggestions` function), and the chat input.
 *
 * URL query parameters:
 *   - `?new=true`            → show the welcome screen (input cleared)
 *   - `?q=<text>`            → pre-fill the input (only meaningful with `?new=true`)
 *   - `?conversationId=<id>` → redirect to `/chat/<id>`
 *
 * Sending a message (input or suggestion click) creates an empty conversation
 * and navigates to `/chat/<id>` with `state.initialMessage` so ConversationPage
 * can stream the first response.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Sparkles } from 'lucide-react';

import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { toast } from 'sonner';

import { ChatInputBox } from '@/components/aidip/ChatInputBox';
import { ConversationSidebar } from '@/components/aidip/ConversationSidebar';
import { Skeleton } from '@/components/ui/skeleton';

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAidipSession();

  const conversationIdParam = searchParams.get('conversationId');
  const isNew = searchParams.get('new') === 'true';
  const qParam = searchParams.get('q') ?? '';

  // Pre-fill input when arriving with ?new=true&q=...
  const [input, setInput] = useState(() => (isNew && qParam ? qParam : ''));
  const [sending, setSending] = useState(false);

  // Dynamic chat suggestions — loaded from the Rayfin `getChatSuggestions`
  // function on mount. Empty array means "loading or server-side error", in
  // which case we render skeleton cards rather than a fallback.
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await ServiceContainer.getInstance().aidip.chat.getSuggestions();
        if (!cancelled) setSuggestions(result);
      } catch (err) {
        console.error('Failed to load chat suggestions', err);
        // Leave suggestions empty — skeletons act as a graceful fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewConversation = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setSending(true);
      try {
        const svc = ServiceContainer.getInstance().aidip.conversation;
        // Pre-set the title from the question so the sidebar shows context immediately.
        const conv = await svc.create(trimmed.slice(0, 60));
        navigate(`/chat/${conv.id}`, { state: { initialMessage: trimmed } });
      } catch (err) {
        console.error('Failed to start conversation', err);
        toast.error('Failed to start a new conversation. Please try again.');
        setSending(false);
      }
    },
    [navigate, sending],
  );

  // ?conversationId=<id> → redirect to /chat/<id>.
  // Early return must come AFTER all hooks (rules of hooks).
  if (conversationIdParam) {
    return <Navigate to={`/chat/${conversationIdParam}`} replace />;
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <ConversationSidebar />

      <section className="flex flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-12">
          {/* Eyebrow chip */}
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-medium text-primary-subtle-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            AIDIP Assistant
          </div>

          {/* Greeting */}
          <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Hello {firstName}, what would you like to know?
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Ask anything about your data. I&apos;ll help you find insights.
          </p>

          {/* Suggestion cards */}
          <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {suggestions.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
                    aria-hidden="true"
                  >
                    <Skeleton className="mt-0.5 h-7 w-7 shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))
              : suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void startNewConversation(s)}
                    disabled={sending}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle transition-colors group-hover:bg-primary/15">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{s}</span>
                  </button>
                ))}
          </div>

          {/* Input */}
          <div className="mt-8 w-full">
            <ChatInputBox
              value={input}
              onChange={setInput}
              onSend={() => void startNewConversation(input)}
              disabled={sending}
              isGenerating={false}
              placeholder="Ask anything about your data…"
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              AIDIP answers only from your authorized semantic models. Press
              <kbd className="mx-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
              to send,
              <kbd className="mx-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>
              for a newline.
            </p>
          </div>

          {/* Footer link */}
          <div className="mt-6 text-center text-[11px] text-muted-foreground">
            Need inspiration?{' '}
            <Link to="/dashboard" className="font-medium text-primary hover:underline">
              View your dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
