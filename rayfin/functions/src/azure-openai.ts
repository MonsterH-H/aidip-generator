/**
 * Azure OpenAI client helper for the AIDIP server-side functions.
 *
 * Reads configuration from `process.env` (populated by `local.settings.json`
 * in production):
 *   - AzureOpenAI__Endpoint       — e.g. https://aidip.openai.azure.com/
 *   - AzureOpenAI__ApiKey         — service API key
 *   - AzureOpenAI__ModelFast      — gpt-4o-mini (intent classification, DAX generation)
 *   - AzureOpenAI__ModelComplex   — gpt-4.1 (analysis & formatting)
 *   - AzureOpenAI__ModelReport    — gpt-4.1 (report AI insights)
 *
 * If Azure OpenAI is not configured (env vars empty), `getAzureOpenAIConfig()`
 * returns `null`. Callers must handle this case and surface an
 * `errorKind: 'ai_unavailable'` to the client.
 */

import { OpenAIClient, AzureKeyCredential, type ChatRequestMessage } from '@azure/openai';

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  modelFast: string;
  modelComplex: string;
  modelReport: string;
}

let cachedClient: OpenAIClient | null = null;
let cachedConfig: AzureOpenAIConfig | null = null;

/**
 * Returns the Azure OpenAI configuration or null if the required env vars
 * (endpoint + API key) are not set.
 */
export function getAzureOpenAIConfig(): AzureOpenAIConfig | null {
  if (cachedConfig) return cachedConfig;
  const endpoint = process.env.AzureOpenAI__Endpoint?.trim();
  const apiKey = process.env.AzureOpenAI__ApiKey?.trim();
  if (!endpoint || !apiKey) return null;
  cachedConfig = {
    endpoint,
    apiKey,
    modelFast: process.env.AzureOpenAI__ModelFast?.trim() || 'gpt-4o-mini',
    modelComplex: process.env.AzureOpenAI__ModelComplex?.trim() || 'gpt-4.1',
    modelReport: process.env.AzureOpenAI__ModelReport?.trim() || 'gpt-4.1',
  };
  return cachedConfig;
}

/**
 * Lazily initialises and returns the Azure OpenAI client. Throws if Azure
 * OpenAI is not configured — callers should call `getAzureOpenAIConfig()`
 * first to guard against this.
 */
export function getOpenAIClient(): OpenAIClient {
  const config = getAzureOpenAIConfig();
  if (!config) {
    throw new Error(
      'Azure OpenAI is not configured. Set AzureOpenAI__Endpoint and AzureOpenAI__ApiKey in local.settings.json.',
    );
  }
  if (!cachedClient) {
    cachedClient = new OpenAIClient(config.endpoint, new AzureKeyCredential(config.apiKey));
  }
  return cachedClient;
}

export type AiChatMessage = ChatRequestMessage;

export interface ChatCompletionResult {
  content: string;
  tokensUsed: number;
  finishReason: string;
}

/**
 * Helper around `OpenAIClient.getChatCompletions` that returns a normalised
 * result with `content`, `tokensUsed`, and `finishReason`.
 *
 * Supports JSON-mode by setting `responseFormat: 'json_object'` in the
 * options — the caller is responsible for parsing the content as JSON.
 */
export async function chatCompletion(
  deploymentName: string,
  messages: AiChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
  } = {},
): Promise<ChatCompletionResult> {
  const client = getOpenAIClient();
  const result = await client.getChatCompletions(deploymentName, messages, {
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 800,
    responseFormat: options.responseFormat
      ? { type: options.responseFormat }
      : undefined,
  });
  const choice = result.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    tokensUsed: result.usage?.totalTokens ?? 0,
    finishReason: choice?.finishReason ?? 'stop',
  };
}

/**
 * Reset the cached client + config — used by tests to start with a fresh
 * client. Not intended for production use.
 */
export function resetOpenAIClientCache(): void {
  cachedClient = null;
  cachedConfig = null;
}
