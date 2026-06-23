/**
 * Rayfin-backed AIDIP Chat service.
 *
 * The 7-step pipeline (validation → intent → DAX generation → DAB/XMLA
 * execution → guardrail → formatting → save) runs server-side as a
 * Rayfin function defined in rayfin.yml. The client invokes it via
 * `client.functions.chat.invoke(...)`, which returns the complete structured
 * response in a single call — no client-side streaming.
 *
 * On the client side we:
 *   1. Persist the user message immediately
 *   2. Invoke the server-side chat function
 *   3. Persist the assistant message
 *   4. Return both messages to the caller
 *
 * If the server function returns an error kind (e.g. empty_data), the
 * assistant message is persisted with the corresponding errorKind and
 * a generic "No data was found..." body — the anti-hallucination
 * guardrail is enforced server-side.
 */

import type {
  ChatMessage,
  ChatMessageContent,
  SendChatMessageInput,
  SendChatMessageResult,
} from '@/lib/aidip/types';
import type { IChatService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { nowIso, parseJson, stringifyJson } from './helpers';
import { recordAudit } from './audit-helpers';

interface RayfinChatMessageRow {
  id: string;
  company_id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  contentText: string;
  contentJson?: string | null;
  daxQuery?: string | null;
  tokensUsed?: number | null;
  modelUsed?: string | null;
  responseTimeMs?: number | null;
  feedback?: 'positive' | 'negative' | null;
  feedbackReason?: string | null;
  errorKind?: 'ai_unavailable' | 'fabric_unavailable' | 'timeout' | 'quota_exceeded' | 'empty_data' | null;
  createdAt: string;
}

function mapRow(row: RayfinChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role,
    contentText: row.contentText,
    contentJson: row.contentJson ? (parseJson<ChatMessageContent>(row.contentJson) ?? null) : null,
    daxQuery: row.daxQuery ?? null,
    tokensUsed: row.tokensUsed ?? null,
    modelUsed: row.modelUsed ?? null,
    responseTimeMs: row.responseTimeMs ?? null,
    feedback: row.feedback ?? null,
    feedbackReason: row.feedbackReason ?? null,
    errorKind: row.errorKind ?? null,
    createdAt: row.createdAt,
  };
}

/** Shape returned by the server-side chat function (defined in rayfin.yml). */
interface ChatFunctionResult {
  text: string;
  sourceCitation?: string;
  visualization?: ChatMessageContent['visualization'];
  table?: ChatMessageContent['table'];
  insights?: ChatMessageContent['insights'];
  daxQuery?: string;
  tokensUsed?: number;
  modelUsed?: string;
  responseTimeMs?: number;
  errorKind?: ChatMessage['errorKind'];
}

const EMPTY_DATA_TEXT =
  'No data was found matching your request in the authorized sources.';

export class RayfinChatService implements IChatService {
  async sendMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error('No company in session.');

    // Resolve or create the conversation.
    let conversationId = input.conversationId;
    let conversation;
    if (conversationId) {
      conversation = await client.data.Conversation.findById(conversationId);
      if (!conversation) throw new Error('Conversation not found.');
    } else {
      const now = nowIso();
      conversation = await client.data.Conversation.create({
        company_id: companyId,
        user_id: userId,
        title: input.text.slice(0, 60),
        messageCount: 0,
        status: 'active',
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      } as never);
      conversationId = (conversation as unknown as { id: string }).id;
    }

    // 1. Persist the user message immediately.
    const userMessageRow = await client.data.ChatMessage.create({
      company_id: companyId,
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      contentText: input.text,
      contentJson: null,
      daxQuery: null,
      tokensUsed: null,
      modelUsed: null,
      responseTimeMs: null,
      feedback: null,
      feedbackReason: null,
      errorKind: null,
      createdAt: nowIso(),
    } as never);
    const userMessage = mapRow(userMessageRow as unknown as RayfinChatMessageRow);

    // 2. Invoke the server-side chat pipeline (Rayfin function).
    // The function is registered in rayfin/functions/src/function_app.ts
    // and runs the full 7-step pipeline with RLS, guardrails, and DAX
    // generation server-side.
    let result: ChatFunctionResult;
    try {
      result = await client.functions.chat.invoke({ conversationId, text: input.text });
    } catch (err) {
      // Network or function-execution error → graceful degradation.
      console.error('Chat function invocation failed:', err);
      result = {
        text: "I'm having trouble connecting right now. Please retry in a moment.",
        errorKind: 'ai_unavailable',
        tokensUsed: 0,
        modelUsed: 'unknown',
        responseTimeMs: 0,
      };
    }

    // 3. Apply the anti-hallucination guardrail (defense-in-depth — the
    // server already enforces it, but we double-check on the client).
    const content: ChatMessageContent =
      result.errorKind === 'empty_data'
        ? { text: EMPTY_DATA_TEXT }
        : {
            text: result.text,
            sourceCitation: result.sourceCitation,
            visualization: result.visualization,
            table: result.table,
            insights: result.insights,
          };

    // 4. Persist the assistant message.
    const assistantMessageRow = await client.data.ChatMessage.create({
      company_id: companyId,
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      contentText: content.text,
      contentJson: stringifyJson(content),
      daxQuery: result.daxQuery ?? null,
      tokensUsed: result.tokensUsed ?? null,
      modelUsed: result.modelUsed ?? null,
      responseTimeMs: result.responseTimeMs ?? null,
      feedback: null,
      feedbackReason: null,
      errorKind: result.errorKind ?? null,
      createdAt: nowIso(),
    } as never);
    const assistantMessage = mapRow(assistantMessageRow as unknown as RayfinChatMessageRow);

    // 5. Update conversation metadata.
    await client.data.Conversation.update(
      { id: conversationId },
      {
        messageCount: ((conversation as unknown as { messageCount: number }).messageCount ?? 0) + 2,
        lastMessageAt: nowIso(),
        updatedAt: nowIso(),
      } as never,
    );

    const updatedConversation = await client.data.Conversation.findById(conversationId);
    return {
      conversation: {
        id: (updatedConversation as unknown as { id: string }).id,
        companyId: (updatedConversation as unknown as { company_id: string }).company_id,
        userId: (updatedConversation as unknown as { user_id: string }).user_id,
        title: (updatedConversation as unknown as { title: string }).title,
        messageCount: (updatedConversation as unknown as { messageCount: number }).messageCount,
        status: (updatedConversation as unknown as { status: 'active' | 'archived' | 'deleted' }).status,
        lastMessageAt: (updatedConversation as unknown as { lastMessageAt: string }).lastMessageAt,
        createdAt: (updatedConversation as unknown as { createdAt: string }).createdAt,
        updatedAt: (updatedConversation as unknown as { updatedAt: string }).updatedAt,
      },
      userMessage,
      assistantMessage,
    };
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const client = getRayfinClient();
    const rows = await client.data.ChatMessage.findMany({
      conversation_id: { eq: conversationId },
    } as never);
    return rows
      .map((r) => mapRow(r as unknown as RayfinChatMessageRow))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async setFeedback(
    messageId: string,
    feedback: 'positive' | 'negative',
    reason?: string,
  ): Promise<void> {
    const client = getRayfinClient();
    await client.data.ChatMessage.update(
      { id: messageId },
      { feedback, feedbackReason: reason ?? null } as never,
    );
    await recordAudit('report_shared', 'chat_message', messageId, { feedback, reason }, 'info');
  }

  async generateInsight(input: {
    prompt: string;
    length: 'short' | 'medium' | 'long';
    previousSectionData?: {
      type: 'chart' | 'table' | 'kpi' | 'text';
      title?: string;
      series?: { label: string; value: number }[];
      rows?: Record<string, string | number>[];
      kpiValue?: number;
      kpiLabel?: string;
      text?: string;
    } | null;
  }): Promise<{ ok: boolean; bullets: string[]; errorMessage?: string }> {
    const client = getRayfinClient();
    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return { ok: false, bullets: [], errorMessage: 'No company in session.' };
    }
    try {
      const result = await client.functions.generateAiInsight.invoke({
        prompt: input.prompt,
        length: input.length,
        previousSectionData: input.previousSectionData ?? null,
        companyId,
      });
      return {
        ok: result.ok,
        bullets: result.bullets,
        errorMessage: result.errorMessage,
      };
    } catch (err) {
      console.error('generateInsight invocation failed:', err);
      return {
        ok: false,
        bullets: [],
        errorMessage: 'Failed to invoke AI insight generation. Make sure the Rayfin Functions service is deployed.',
      };
    }
  }

  async getSuggestions(): Promise<string[]> {
    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    if (!companyId) return [];
    try {
      const result = await client.functions.getChatSuggestions.invoke({
        companyId,
        userId,
      });
      return result.ok ? result.suggestions : [];
    } catch (err) {
      console.error('getSuggestions invocation failed:', err);
      return [];
    }
  }
}
