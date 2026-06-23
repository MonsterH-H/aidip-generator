/**
 * Resend email client helper for the AIDIP server-side functions.
 *
 * Reads configuration from `process.env` (populated by `local.settings.json`):
 *   - Resend__ApiKey       — Resend API key (re_xxx)
 *   - Email__From          — From address (e.g. "AIDIP <noreply@hesyd.com>")
 *   - Email__SupportEmail  — Support reply-to address
 *   - App__BaseUrl         — Front-end base URL for links (e.g. http://localhost:5173)
 *
 * If Resend is not configured (API key empty), `getResendClient()` returns
 * `null`. Callers must handle this case — email delivery is best-effort
 * and should never block the main operation.
 */

import { Resend, type CreateEmailOptions } from 'resend';

let cachedClient: Resend | null = null;
let cachedInitialized = false;

/**
 * Returns the Resend client or null if the API key is not set.
 */
export function getResendClient(): Resend | null {
  if (cachedInitialized) return cachedClient;
  cachedInitialized = true;
  const apiKey = process.env.Resend__ApiKey?.trim();
  if (!apiKey) {
    return null;
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

/** Returns the configured From address. */
export function getFromAddress(): string {
  return process.env.Email__From?.trim() || 'AIDIP <noreply@hesyd.com>';
}

/** Returns the configured support email. */
export function getSupportEmail(): string {
  return process.env.Email__SupportEmail?.trim() || 'support@hesyd.com';
}

/** Returns the front-end base URL for building links. */
export function getAppBaseUrl(): string {
  return process.env.App__BaseUrl?.trim() || 'http://localhost:5173';
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  errorMessage?: string;
}

/**
 * Sends an email via Resend. Returns `{ ok: true }` on success or
 * `{ ok: false, errorMessage }` on failure. Never throws — callers
 * should log the error and continue.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<SendEmailResult> {
  const client = getResendClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Resend API key is not configured. Set Resend__ApiKey in local.settings.json.',
    };
  }

  try {
    const emailOptions: CreateEmailOptions = {
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo ?? getSupportEmail(),
      tags: options.tags,
    };
    const result = await client.emails.send(emailOptions);
    return { ok: true, messageId: result.id };
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Resend send failed: ${String(err)}`,
    };
  }
}
