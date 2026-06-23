/**
 * HTML email templates for AIDIP — premium branded templates inspired by
 * the Azure Portal / Microsoft Fabric design language.
 *
 * All templates use inline CSS (email-safe) and the AIDIP brand palette:
 *   - Primary: Azure Blue #0078D4
 *   - Background: #F8FAFC (slate-50)
 *   - Text: #0F172A (slate-900)
 *   - Muted: #64748B (slate-500)
 */

import { getAppBaseUrl, getSupportEmail } from './email.js';

/** Common HTML wrapper with header + footer. */
function emailWrapper(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:'Inter',-apple-system,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0078D4;padding:24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.02em;">
                    AIDIP
                  </td>
                  <td align="right" style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">
                    AI Decision Intelligence Platform
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #E2E8F0;background-color:#F8FAFC;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748B;line-height:1.5;">
                This email was sent by AIDIP. If you believe this was sent in error, please contact
                <a href="mailto:${getSupportEmail()}" style="color:#0078D4;text-decoration:none;">${getSupportEmail()}</a>.
              </p>
              <p style="margin:0;font-size:11px;color:#94A3B8;">
                © 2026 HESYD — Cabinet Solutions Digitales & Data Intelligence. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** CTA button styled as Azure-blue pill. */
function ctaButton(url: string, label: string): string {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background-color:#0078D4;border-radius:6px;">
          <a href="${url}" style="display:inline-block;padding:12px 32px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

// ============================================================================
// Invitation email
// ============================================================================

export interface InvitationEmailData {
  inviteeEmail: string;
  inviteeRole: 'super_admin' | 'admin' | 'analyst';
  companyName: string;
  inviterName: string;
  personalMessage: string | null;
  token: string;
  expiresAt: string; // ISO date
}

export function buildInvitationEmail(data: InvitationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const acceptUrl = `${getAppBaseUrl()}/invite/accept?token=${data.token}`;
  const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const roleLabel =
    data.inviteeRole === 'admin'
      ? 'Admin Entreprise'
      : data.inviteeRole === 'super_admin'
        ? 'Super Admin'
        : 'Analyste';

  const messageBlock = data.personalMessage
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#F8FAFC;border-left:3px solid #0078D4;border-radius:4px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#64748B;font-style:italic;">
              "${data.personalMessage}"
            </p>
          </td>
        </tr>
      </table>`
    : '';

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">
      You've been invited to join ${data.companyName}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">
      ${data.inviterName} has invited you to join AIDIP as <strong style="color:#0F172A;">${roleLabel}</strong>.
    </p>
    ${messageBlock}
    <p style="margin:0 0 8px;font-size:14px;color:#0F172A;line-height:1.6;">
      AIDIP is a conversational BI platform that lets you ask questions about your data in natural language
      and get live answers from your Microsoft Fabric workspace — no DAX, SQL, or Power BI expertise required.
    </p>
    ${ctaButton(acceptUrl, 'Accept Invitation')}
    <p style="margin:16px 0 0;font-size:13px;color:#64748B;">
      This invitation expires on <strong>${expiryDate}</strong>. If you don't have an account yet,
      you'll be prompted to sign in with your Microsoft account after accepting.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#94A3B8;">
      Or copy this link: <a href="${acceptUrl}" style="color:#0078D4;text-decoration:none;word-break:break-all;">${acceptUrl}</a>
    </p>`;

  const text = `You've been invited to join ${data.companyName}

${data.inviterName} has invited you to join AIDIP as ${roleLabel}.

${data.personalMessage ? `Personal message: "${data.personalMessage}"\n\n` : ''}AIDIP is a conversational BI platform that lets you ask questions about your data in natural language.

Accept your invitation: ${acceptUrl}

This invitation expires on ${expiryDate}.

© 2026 HESYD — Cabinet Solutions Digitales & Data Intelligence`;

  return {
    subject: `You've been invited to join ${data.companyName} on AIDIP`,
    html: emailWrapper(content, "You've been invited to AIDIP"),
    text,
  };
}

// ============================================================================
// Notification email
// ============================================================================

export interface NotificationEmailData {
  recipientName: string;
  notificationTitle: string;
  notificationMessage: string;
  notificationType: string;
  actionUrl: string | null;
  actionLabel: string | null;
}

export function buildNotificationEmail(data: NotificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const actionBlock =
    data.actionUrl && data.actionLabel
      ? ctaButton(data.actionUrl, data.actionLabel)
      : '';

  const content = `
    <p style="margin:0 0 8px;font-size:13px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
      ${data.notificationType.replace(/_/g, ' ')}
    </p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">
      ${data.notificationTitle}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      ${data.notificationMessage}
    </p>
    ${actionBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#64748B;">
      You received this email because you have email notifications enabled in your AIDIP profile.
      <a href="${getAppBaseUrl()}/profile" style="color:#0078D4;text-decoration:none;">Manage your preferences</a>.
    </p>`;

  const text = `${data.notificationTitle}

${data.notificationMessage}

${data.actionUrl && data.actionLabel ? `${data.actionLabel}: ${data.actionUrl}\n\n` : ''}You received this email because you have email notifications enabled in your AIDIP profile.

Manage your preferences: ${getAppBaseUrl()}/profile

© 2026 HESYD`;

  return {
    subject: `AIDIP — ${data.notificationTitle}`,
    html: emailWrapper(content, data.notificationTitle),
    text,
  };
}

// ============================================================================
// Export ready email
// ============================================================================

export interface ExportReadyEmailData {
  recipientName: string;
  reportTitle: string;
  format: 'pdf' | 'ppt';
  fileSizeKb: number;
  downloadUrl: string;
  expiresAt: string;
}

export function buildExportReadyEmail(data: ExportReadyEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const expiryDate = new Date(data.expiresAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const sizeStr =
    data.fileSizeKb >= 1024
      ? `${(data.fileSizeKb / 1024).toFixed(1)} MB`
      : `${data.fileSizeKb} KB`;

  const content = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">
      Your export is ready
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">
      <strong style="color:#0F172A;">${data.reportTitle}</strong> · ${data.format.toUpperCase()} · ${sizeStr}
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.6;">
      Your export has been generated and is available for download. The download link is valid for 24 hours
      (until ${expiryDate}).
    </p>
    ${ctaButton(data.downloadUrl, 'Download Export')}
    <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
      If the button doesn't work, copy this link: <a href="${data.downloadUrl}" style="color:#0078D4;text-decoration:none;word-break:break-all;">${data.downloadUrl}</a>
    </p>`;

  const text = `Your export is ready

${data.reportTitle} · ${data.format.toUpperCase()} · ${sizeStr}

Your export has been generated and is available for download. The download link is valid for 24 hours (until ${expiryDate}).

Download: ${data.downloadUrl}

© 2026 HESYD`;

  return {
    subject: `AIDIP — Export ready: ${data.reportTitle}`,
    html: emailWrapper(content, 'Your export is ready'),
    text,
  };
}
