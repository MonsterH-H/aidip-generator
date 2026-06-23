/**
 * AIDIP — Chat input box (CDC §6.3.1).
 *
 * Auto-resizing textarea + send/stop control used by both the welcome
 * screen (ChatPage) and the active conversation (ConversationPage).
 *
 * Keyboard contract (CDC §6.3.1):
 *   - Enter        → send
 *   - Shift+Enter  → newline
 *   - Escape       → cancel (during generation only)
 *
 * Character budget per CDC §6 Rule 9 / §15:
 *   - Hard max: CHAT_MESSAGE_MAX_LENGTH (2000)
 *   - Counter appears past CHAT_MESSAGE_COUNTER_THRESHOLD (1500)
 *   - Counter turns red at the max
 */

import { useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_COUNTER_THRESHOLD,
} from '@/lib/aidip/constants';

export interface ChatInputBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  placeholder?: string;
}

/** Visual cap before the textarea starts scrolling instead of growing. */
const MAX_VISIBLE_ROWS = 6;
const LINE_HEIGHT_PX = 22;

export function ChatInputBox({
  value,
  onChange,
  onSend,
  onCancel,
  disabled = false,
  isGenerating = false,
  placeholder = 'Ask anything about your data…',
}: ChatInputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: cap at MAX_VISIBLE_ROWS lines, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT_PX * MAX_VISIBLE_ROWS;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
  }, [value]);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled && value.length <= CHAT_MESSAGE_MAX_LENGTH;
  const showCounter = value.length > CHAT_MESSAGE_COUNTER_THRESHOLD;
  const atMax = value.length >= CHAT_MESSAGE_MAX_LENGTH;

  // Textarea is read-only while generating (Stop button is the only action).
  const textareaReadOnly = disabled || isGenerating;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isGenerating) onSend();
      return;
    }
    if (e.key === 'Escape' && isGenerating && onCancel) {
      e.preventDefault();
      onCancel();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    // Hard cap at CHAT_MESSAGE_MAX_LENGTH — extra chars are dropped.
    const next = e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH);
    onChange(next);
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-all',
          'focus-within:border-primary/60 focus-within:shadow-md',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={textareaReadOnly}
          rows={1}
          spellCheck
          aria-label="Chat message"
          placeholder={placeholder}
          style={{ lineHeight: `${LINE_HEIGHT_PX}px` }}
          className={cn(
            'flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm outline-none',
            'placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed',
          )}
        />

        {isGenerating ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={onCancel}
            disabled={!onCancel}
            aria-label="Stop generating"
            className="h-9 w-9 shrink-0"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showCounter && (
        <div
          className={cn(
            'mt-1 text-right text-[11px] tabular-nums',
            atMax ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {value.length} / {CHAT_MESSAGE_MAX_LENGTH}
        </div>
      )}
    </div>
  );
}
