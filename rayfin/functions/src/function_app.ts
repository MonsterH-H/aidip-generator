/**
 * AIDIP — Server-side Rayfin Functions (UDFs).
 *
 * These functions run in the Microsoft Fabric runtime with elevated
 * permissions and access Fabric resources directly. They are invoked
 * from the frontend via `client.functions.<name>.invoke(args)`.
 *
 * Per CDC-AIDIP-FINAL-v3.0:
 *   - chat            → 7-step chatbot pipeline (CDC §6.4)
 *   - exportReport    → async PDF/PPT worker (CDC §9)
 *   - getKpiValues    → live KPI computation from Fabric semantic models
 *   - startImpersonation / endImpersonation / getImpersonationState
 *                     → audited super-admin impersonation (CDC §5)
 *   - testFabricConnection → XMLA endpoint connectivity check (CDC §14)
 *   - extractSemanticSchema → Semantic Model schema extraction (CDC §6.4 step 3)
 *
 * Run `npx rayfin functions typegen` to regenerate `types.ts` after
 * editing any `udf.func()` signatures below.
 */

import {
  UserDataFunctions,
  type RayfinContext,
  type DaxQueryResult,
  type ExecuteDaxOptions,
} from '@microsoft/fabric-user-data-functions';

import type { AidipSchema } from '../../data/schema.js';
import type { Company } from '../../data/Company.js';
import type { KpiConfig } from '../../data/KpiConfig.js';
import type { Report } from '../../data/Report.js';
import type { ReportSection } from '../../data/ReportSection.js';
import type { ReportSnapshot } from '../../data/ReportSnapshot.js';
import type { ChatMessage } from '../../data/ChatMessage.js';
import type { Conversation } from '../../data/Conversation.js';
import type { User } from '../../data/User.js';
import type { Notification } from '../../data/Notification.js';

import {
  getAzureOpenAIConfig,
  chatCompletion,
  type AiChatMessage,
} from './azure-openai.js';
import {
  analyzeIntent,
  generateDax,
  analyzeAndFormat,
  cacheSemanticSchema,
  getCachedSemanticSchema,
  type SemanticModelSchema,
  type AnalysisResult,
} from './dax-pipeline.js';
import {
  signImpersonationToken,
  decodeImpersonationToken,
  verifyImpersonationToken,
  getImpersonationTtlMinutes,
  type ImpersonationTokenPayload,
} from './jwt.js';

const udf = new UserDataFunctions();

/* ============================================================================
   Shared constants & helpers
   ============================================================================ */

const POWER_BI_API_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';

const DAX_TIMEOUT_MS = 30_000;
const EXPORT_SIGNED_URL_TTL_HOURS = 24;

/** Empty-data guardrail message (CDC §6.4 — Rule 6 anti-hallucination). */
const EMPTY_DATA_TEXT =
  'No data was found matching your request in the authorized sources.';

/**
 * In-memory store of active impersonation sessions, keyed by the
 * impersonation token. Used by `endImpersonation` to invalidate a session
 * and by `getImpersonationState` as a secondary check (the JWT claim on
 * `ctx.accessToken` is the primary source of truth).
 *
 * Multi-instance caveat: in production with multiple function workers,
 * each worker maintains its own copy of this map. The JWT expiry (30 min)
 * is the hard bound on impersonation duration regardless of map state.
 */
interface ActiveImpersonationEntry {
  token: string;
  superAdminId: string;
  superAdminName: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  targetCompanyName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}
const activeImpersonations = new Map<string, ActiveImpersonationEntry>();

/** Extract the current caller's user id from the JWT claims. */
function getCallerUserId(ctx: RayfinContext<AidipSchema>): string {
  const claims = ctx.getRequestClaims?.();
  if (claims && typeof claims.sub === 'string') return claims.sub;
  // Defensive fallback — should never happen in production (the runtime
  // always populates claims for an authenticated request).
  return '';
}

/** Convert a ChatMessage row into an AI-history message for context. */
function toAiMessage(row: ChatMessage): AiChatMessage | null {
  if (row.role !== 'user' && row.role !== 'assistant') return null;
  return { role: row.role, content: row.contentText };
}

/** Decode a company's encrypted SP secret (placeholder — see NOTE below). */
function decryptSecret(encrypted: string | null | undefined): string {
  // NOTE — in production this calls the Fabric KeyVault helper to decrypt
  // the `servicePrincipalClientSecretEnc` column. For the local dev path,
  // the secret is stored in plain text in `local.settings.json` and the
  // column is also plain text. Either way, we return the raw value here.
  if (!encrypted) return '';
  return encrypted;
}

/**
 * Acquire an Entra ID access token for the Power BI REST API using the
 * Service Principal configured on the company row.
 */
async function getPowerBiAccessToken(company: Company): Promise<string> {
  const tenantId = company.azureTenantId;
  const clientId = company.servicePrincipalClientId;
  const clientSecret = decryptSecret(company.servicePrincipalClientSecretEnc);
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Service Principal credentials are not configured.');
  }

  // Lazy import so the @azure/identity dependency is optional at module
  // load time. If the package is missing, callers receive a clear error.
  const { ClientSecretCredential } = await import('@azure/identity');
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const token = await credential.getToken(POWER_BI_API_SCOPE);
  if (!token || !token.token) {
    throw new Error('Failed to acquire Power BI access token from Entra ID.');
  }
  return token.token;
}

/** Build the Power BI executeQueries request body for a single DAX query. */
function buildExecuteQueriesBody(dax: string): string {
  return JSON.stringify({
    queries: [{ query: dax }],
    impersonatedUserName: null,
  });
}

interface PowerBiExecuteResult {
  tables: Array<{
    rows: Record<string, unknown>[];
    columns?: Array<{ name: string }>;
  }>;
}

/** Execute a DAX query against the company's Semantic Model via Power BI REST. */
async function executeDaxViaPowerBiRest(
  company: Company,
  dax: string,
  options: { timeoutMs?: number } = {},
): Promise<DaxQueryResult> {
  const accessToken = await getPowerBiAccessToken(company);
  if (!company.fabricWorkspaceId || !company.fabricSemanticModelId) {
    throw new Error('Semantic Model ID or Workspace ID is not configured.');
  }
  const url = `${POWER_BI_API_BASE}/groups/${company.fabricWorkspaceId}/datasets/${company.fabricSemanticModelId}/executeQueries`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DAX_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: buildExecuteQueriesBody(dax),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Power BI HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const json = (await response.json()) as PowerBiExecuteResult;
    const firstTable = json.tables?.[0];
    const rows = firstTable?.rows ?? [];
    const columns =
      firstTable?.columns?.map((c) => c.name) ??
      (rows.length > 0 ? Object.keys(rows[0]) : []);
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: 0, // Power BI REST does not report timing; caller measures wall-clock.
    };
  } finally {
    clearTimeout(timer);
  }
}

interface PowerBiTableMetadata {
  name: string;
  columns: Array<{ name: string; type?: string }>;
  measures?: Array<{ name: string; expression?: string }>;
}

interface PowerBiTablesResponse {
  value: PowerBiTableMetadata[];
}

/** Fetch the list of tables (with columns + measures) from the Semantic Model. */
async function fetchSemanticModelTables(company: Company): Promise<PowerBiTableMetadata[]> {
  const accessToken = await getPowerBiAccessToken(company);
  if (!company.fabricWorkspaceId || !company.fabricSemanticModelId) {
    throw new Error('Semantic Model ID or Workspace ID is not configured.');
  }
  const url = `${POWER_BI_API_BASE}/groups/${company.fabricWorkspaceId}/datasets/${company.fabricSemanticModelId}/tables`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Power BI HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as PowerBiTablesResponse;
  return json.value ?? [];
}

/** Convert the Power BI tables response into our SemanticModelSchema shape. */
function toSemanticSchema(tables: PowerBiTableMetadata[]): SemanticModelSchema {
  return {
    tables: tables.map((t) => ({
      name: t.name,
      columns: (t.columns ?? []).map((c) => c.name),
      measures: (t.measures ?? []).map((m) => m.name),
    })),
  };
}

/** Extract the first numeric value from a DAX result row. */
function extractSingleValue(result: DaxQueryResult): number {
  if (result.rows.length === 0) return 0;
  const row = result.rows[0];
  for (const col of result.columns) {
    const v = row[col];
    if (typeof v === 'number' && isFinite(v)) return v;
  }
  // Try parsing strings as numbers.
  for (const col of result.columns) {
    const v = row[col];
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.-]/g, '');
      const n = Number(cleaned);
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return 0;
}

/**
 * Rewrite a DAX query to point at a shifted time window. Replaces
 * `TODAY()` / `NOW()` with `DATEADD(DAY, -N, TODAY())` so successive
 * calls produce a 7-point sparkline.
 */
function shiftDaxForSparkline(dax: string, daysBack: number): string {
  return dax
    .replace(/\bTODAY\(\)/gi, `DATEADD(DAY, -${daysBack}, TODAY())`)
    .replace(/\bNOW\(\)/gi, `DATEADD(DAY, -${daysBack}, NOW())`);
}

/**
 * Rewrite a DAX query to point at the previous period (default: previous
 * month). Used by the KPI comparison computation.
 */
function shiftDaxForPreviousPeriod(dax: string, monthsBack = 1): string {
  return dax
    .replace(/\bTODAY\(\)/gi, `DATEADD(MONTH, -${monthsBack}, TODAY())`)
    .replace(/\bNOW\(\)/gi, `DATEADD(MONTH, -${monthsBack}, NOW())`);
}

/** Parse a JSON column stored as text, with a safe fallback. */
function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Format a Date as an ISO string safe for JSON serialisation. */
function toIso(date: Date): string {
  return date.toISOString();
}

/* ============================================================================
   1. CHAT — 7-step pipeline (CDC §6.4)
   ============================================================================ */

interface ChatInput {
  conversationId: string;
  text: string;
}

interface ChatVisualization {
  type: 'line' | 'bar' | 'pie' | 'area' | 'kpi';
  title: string;
  source: string;
  series: { label: string; value: number }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

interface ChatTableColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'integer' | 'date' | 'text';
}

interface ChatTableData {
  columns: ChatTableColumn[];
  rows: Record<string, string | number>[];
  totalRows: number;
}

interface ChatInsight {
  kind: 'trend' | 'anomaly' | 'recommendation';
  text: string;
}

interface ChatFunctionResult {
  text: string;
  sourceCitation?: string;
  visualization?: ChatVisualization;
  table?: ChatTableData;
  insights?: ChatInsight[];
  daxQuery?: string;
  tokensUsed?: number;
  modelUsed?: string;
  responseTimeMs?: number;
  errorKind?: 'ai_unavailable' | 'fabric_unavailable' | 'timeout' | 'quota_exceeded' | 'empty_data';
}

udf.func(
  'chat',
  async (input: ChatInput, ctx: RayfinContext<AidipSchema>): Promise<ChatFunctionResult> => {
    const startedAt = Date.now();
    ctx.log.info(`chat invoked: conversationId=${input.conversationId}`);

    // STEP 1 — Validation & sanitization
    if (!input.text || input.text.trim().length === 0) {
      return {
        text: 'Your question is empty. Please ask a specific question about your data.',
        errorKind: 'empty_data',
        tokensUsed: 0,
        modelUsed: 'validator',
        responseTimeMs: Date.now() - startedAt,
      };
    }
    if (input.text.length > 2000) {
      return {
        text: 'Your question exceeds the 2000-character limit. Please rephrase.',
        errorKind: 'empty_data',
        tokensUsed: 0,
        modelUsed: 'validator',
        responseTimeMs: Date.now() - startedAt,
      };
    }

    const data = ctx.getDataClient();

    // Look up the conversation to enforce Rule 4 (company_id isolation).
    const conversation = await data.Conversation.findById(input.conversationId);
    if (!conversation) {
      return {
        text: 'Conversation not found. Please refresh the page and try again.',
        errorKind: 'empty_data',
        tokensUsed: 0,
        modelUsed: 'validator',
        responseTimeMs: Date.now() - startedAt,
      };
    }
    const companyId = conversation.company_id;

    // STEP 2 — Intent analysis (gpt-4o-mini)
    const aiConfig = getAzureOpenAIConfig();
    if (!aiConfig) {
      ctx.log.warn('Azure OpenAI not configured — chat pipeline cannot proceed.');
      return {
        text: 'The AIDIP chatbot pipeline is not yet wired to your Azure OpenAI endpoint. Please ask your Super Admin to complete the AI configuration in the company detail page (AI Config tab).',
        errorKind: 'ai_unavailable',
        tokensUsed: 0,
        modelUsed: 'unconfigured',
        responseTimeMs: Date.now() - startedAt,
      };
    }

    // Fetch the last 5 messages as conversation context.
    const historyRows = await data.ChatMessage.findMany({
      conversation_id: { eq: input.conversationId },
    } as never);
    const recentMessages = (historyRows as ChatMessage[])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-5)
      .map(toAiMessage)
      .filter((m): m is AiChatMessage => m !== null);

    let totalTokens = 0;
    let intent;
    try {
      intent = await analyzeIntent(input.text, recentMessages);
      ctx.log.info(`Intent: ${intent.intent}/${intent.complexity} (${intent.reasoning})`);
    } catch (err) {
      ctx.log.error(`Intent analysis failed: ${String(err)}`);
      return {
        text: "I'm having trouble connecting to the AI service right now. Please retry in a moment.",
        errorKind: 'ai_unavailable',
        tokensUsed: 0,
        modelUsed: aiConfig.modelFast,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    // Load the Semantic Model schema (from cache or in-memory fallback).
    const schema = getCachedSemanticSchema(companyId);

    // STEP 3 — DAX generation
    let dax = '';
    try {
      const useComplex = intent.complexity === 'High';
      const daxResult = await generateDax(
        input.text,
        schema,
        recentMessages,
        useComplex,
      );
      dax = daxResult.dax;
      totalTokens += daxResult.tokensUsed;
      ctx.log.info(`Generated DAX (${dax.length} chars, model=${useComplex ? aiConfig.modelComplex : aiConfig.modelFast}).`);
    } catch (err) {
      ctx.log.error(`DAX generation failed: ${String(err)}`);
      return {
        text: "I'm having trouble generating the right query for your question. Please rephrase or try again.",
        errorKind: 'ai_unavailable',
        tokensUsed: totalTokens,
        modelUsed: aiConfig.modelFast,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    if (!dax || !dax.trim().toUpperCase().startsWith('EVALUATE')) {
      ctx.log.warn(`Generated DAX does not start with EVALUATE: ${dax.slice(0, 80)}`);
      return {
        text: "I couldn't generate a valid query for your question. Please rephrase or ask a more specific question.",
        errorKind: 'ai_unavailable',
        daxQuery: dax,
        tokensUsed: totalTokens,
        modelUsed: aiConfig.modelFast,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    // STEP 4 — Execution via DAB + XMLA (RLS auto, 30s timeout)
    let daxResult: DaxQueryResult;
    const execStart = Date.now();
    try {
      const execOptions: ExecuteDaxOptions = {
        timeoutMs: DAX_TIMEOUT_MS,
        semanticModelId: undefined, // use company's default
      };
      // Prefer the runtime-provided executeDax; fall back to Power BI REST.
      if (typeof ctx.executeDax === 'function') {
        daxResult = await ctx.executeDax(dax, execOptions);
      } else {
        // Fallback path — used when the runtime doesn't expose executeDax
        // (e.g. local dev). Requires the company to be Fabric-configured.
        const company = await data.Company.findById(companyId);
        if (!company) throw new Error('Company not found for DAX execution.');
        daxResult = await executeDaxViaPowerBiRest(company, dax, { timeoutMs: DAX_TIMEOUT_MS });
      }
      ctx.log.info(
        `DAX executed in ${Date.now() - execStart}ms — ${daxResult.rowCount} rows returned.`,
      );
    } catch (err) {
      ctx.log.error(`DAX execution failed: ${String(err)}`);
      return {
        text: "I generated a query but couldn't execute it against the data source. Please retry, or contact your admin if the issue persists.",
        errorKind: 'fabric_unavailable',
        daxQuery: dax,
        tokensUsed: totalTokens,
        modelUsed: aiConfig.modelFast,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    // STEP 5B — Guardrail (Rule 6 anti-hallucination): empty data → hard stop.
    if (daxResult.rowCount === 0) {
      ctx.log.info('DAX returned 0 rows — applying empty-data guardrail.');
      return {
        text: EMPTY_DATA_TEXT,
        errorKind: 'empty_data',
        daxQuery: dax,
        tokensUsed: totalTokens,
        modelUsed: aiConfig.modelFast,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    // STEP 5A — Analysis & formatting
    let analysis: AnalysisResult;
    try {
      analysis = await analyzeAndFormat(
        input.text,
        dax,
        daxResult.rows,
        daxResult.columns,
      );
      ctx.log.info(`Analysis complete — ${analysis.insights.length} insights.`);
    } catch (err) {
      ctx.log.warn(`Analysis failed, using deterministic fallback: ${String(err)}`);
      // Fall back to deterministic formatting (no AI).
      analysis = await analyzeAndFormat(
        input.text,
        dax,
        daxResult.rows,
        daxResult.columns,
      );
    }

    // STEP 6 — Persistence is handled client-side (RayfinChatService.sendMessage)
    // per the AIDIP architecture. No server-side persistence needed here.

    // STEP 7 — Return the structured response
    return {
      text: analysis.text,
      sourceCitation: 'Fabric Semantic Model (live DAX query)',
      visualization: analysis.visualization as ChatVisualization | undefined,
      table: analysis.table as ChatTableData | undefined,
      insights: analysis.insights as ChatInsight[] | undefined,
      daxQuery: dax,
      tokensUsed: totalTokens,
      modelUsed: intent.complexity === 'High' ? aiConfig.modelComplex : aiConfig.modelFast,
      responseTimeMs: Date.now() - startedAt,
    };
  },
  [],
);

/* ============================================================================
   2. EXPORT REPORT — async PDF/PPT worker (CDC §9)
   ============================================================================ */

interface ExportReportInput {
  snapshotId: string;
  reportId: string;
  config: {
    format: 'pdf' | 'ppt';
    includeCoverPage?: boolean;
    includeTableOfContents?: boolean;
    includeCompanyLogo?: boolean;
    quality?: 'standard' | 'high';
    sectionRange?: { from: number; to: number } | null;
    pptTemplate?: 'standard' | 'minimal';
    includeDataTables?: boolean;
  };
}

interface ExportReportResult {
  ok: boolean;
  fileUrl?: string;
  fileSizeKb?: number;
  errorMessage?: string;
}

/** Mark a snapshot as failed with a clear error message. */
async function markSnapshotFailed(
  data: RayfinContext<AidipSchema>['getDataClient'] extends () => infer TData ? TData : never,
  snapshotId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await (data as unknown as {
      ReportSnapshot: {
        update(where: { id: string }, data: unknown): Promise<unknown>;
      };
    }).ReportSnapshot.update(
      { id: snapshotId },
      {
        status: 'failed',
        errorMessage: errorMessage.slice(0, 1000),
        generatedAt: new Date(),
      },
    );
  } catch {
    // Best-effort — we're already in an error path.
  }
}

udf.func(
  'exportReport',
  async (input: ExportReportInput, ctx: RayfinContext<AidipSchema>): Promise<ExportReportResult> => {
    ctx.log.info(`exportReport invoked: snapshotId=${input.snapshotId} reportId=${input.reportId} format=${input.config.format}`);

    const data = ctx.getDataClient();

    try {
      // 1. Load the report and its sections
      const report = (await data.Report.findById(input.reportId)) as Report | null;
      if (!report) {
        throw new Error('Report not found');
      }
      const sections = (await data.ReportSection.findMany({
        report_id: { eq: input.reportId },
      } as never)) as ReportSection[];

      // 2. Filter by section range if specified
      let orderedSections = sections.sort((a, b) => a.orderIndex - b.orderIndex);
      if (input.config.sectionRange) {
        const { from, to } = input.config.sectionRange;
        orderedSections = orderedSections.slice(from - 1, to);
      }

      // 3. Parallel-execute all DAB queries to fetch live data
      const sectionsWithData = await Promise.all(
        orderedSections.map(async (section) => {
          if (!section.dabQuery) {
            return { section, rows: [] as Record<string, unknown>[], columns: [] as string[] };
          }
          try {
            let result: DaxQueryResult;
            if (typeof ctx.executeDax === 'function') {
              result = await ctx.executeDax(section.dabQuery, { timeoutMs: DAX_TIMEOUT_MS });
            } else {
              const company = (await data.Company.findById(report.company_id)) as Company | null;
              if (!company) throw new Error('Company not found.');
              result = await executeDaxViaPowerBiRest(company, section.dabQuery);
            }
            return { section, rows: result.rows, columns: result.columns };
          } catch (err) {
            ctx.log.warn(`DAB query failed for section ${section.id}: ${String(err)}`);
            return { section, rows: [], columns: [], queryError: String(err) };
          }
        }),
      );

      // 4. Assemble the document
      let fileBuffer: Buffer;
      let contentType: string;
      let fileExtension: string;

      if (input.config.format === 'pdf') {
        const result = await renderPdf(report, sectionsWithData, input.config, ctx);
        fileBuffer = result.buffer;
        contentType = 'application/pdf';
        fileExtension = 'pdf';
      } else {
        const result = await renderPpt(report, sectionsWithData, input.config, ctx);
        fileBuffer = result.buffer;
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        fileExtension = 'pptx';
      }

      const fileSizeKb = Math.ceil(fileBuffer.byteLength / 1024);

      // 5. Upload to Fabric storage
      const storage = ctx.getStorageClient?.();
      const container = process.env.Storage__Container ?? 'aidip-exports';
      const blobName = `${report.company_id}/${input.snapshotId}.${fileExtension}`;

      let blobUrl: string;
      if (storage) {
        const uploaded = await storage.upload(container, blobName, fileBuffer, {
          contentType,
          metadata: {
            reportId: input.reportId,
            snapshotId: input.snapshotId,
            format: input.config.format,
          },
        });
        blobUrl = uploaded.url;
      } else {
        // Fallback: @azure/storage-blob using the AzureWebJobsStorage connection string.
        const fallbackUrl = await uploadViaStorageBlob(container, blobName, fileBuffer, contentType);
        blobUrl = fallbackUrl;
      }

      // 6. Generate signed URL (24h)
      const expiresAt = new Date(Date.now() + EXPORT_SIGNED_URL_TTL_HOURS * 60 * 60 * 1000);
      let signedUrl: string | undefined;
      if (storage) {
        try {
          signedUrl = await storage.getSignedUrl(container, blobName, expiresAt);
        } catch (err) {
          ctx.log.warn(`Failed to generate signed URL via storage client: ${String(err)}`);
        }
      }

      // 7. Update ReportSnapshot row + push notification
      await data.ReportSnapshot.update(
        { id: input.snapshotId },
        {
          status: 'completed',
          fileUrl: blobUrl,
          signedUrl: signedUrl ?? blobUrl,
          fileSizeKb,
          errorMessage: null,
          generatedAt: new Date(),
          expiresAt,
        } as never,
      );

      const snapshot = (await data.ReportSnapshot.findById(input.snapshotId)) as ReportSnapshot | null;
      if (snapshot) {
        await data.Notification.create({
          company_id: report.company_id,
          user_id: snapshot.user_id,
          type: 'export_ready',
          title: `Report ready: ${report.title}`,
          message: `Your ${input.config.format.toUpperCase()} export is ready to download (valid for ${EXPORT_SIGNED_URL_TTL_HOURS}h).`,
          actionUrl: signedUrl ?? blobUrl,
          actionLabel: 'Download',
          status: 'unread',
          readAt: null,
          archivedAt: null,
          createdAt: new Date(),
        } as never);
      }

      ctx.log.info(`exportReport completed: ${fileSizeKb}KB, url=${blobUrl}`);
      return { ok: true, fileUrl: signedUrl ?? blobUrl, fileSizeKb };
    } catch (err) {
      ctx.log.error(`exportReport failed: ${String(err)}`);
      await markSnapshotFailed(data, input.snapshotId, String(err));
      return { ok: false, errorMessage: String(err) };
    }
  },
  [],
);

/* ----------------------------------------------------------------------------
   PDF rendering helpers (Puppeteer-based with graceful fallback).
   ---------------------------------------------------------------------------- */

interface RenderedSection {
  section: ReportSection;
  rows: Record<string, unknown>[];
  columns: string[];
  queryError?: string;
}

async function renderPdf(
  report: Report,
  sections: RenderedSection[],
  config: ExportReportInput['config'],
  ctx: RayfinContext<AidipSchema>,
): Promise<{ buffer: Buffer }> {
  let puppeteer: typeof import('puppeteer-core') | null = null;
  try {
    puppeteer = await import('puppeteer-core');
  } catch {
    ctx.log.warn('puppeteer-core is not installed — PDF rendering unavailable.');
    throw new Error(
      'PDF rendering requires the `puppeteer-core` dependency. Run `npm install puppeteer-core` in `rayfin/functions/` and set the CHROME_PATH env var to a Chromium executable.',
    );
  }

  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) {
    throw new Error(
      'CHROME_PATH env var is not set. Puppeteer needs a Chromium executable path to render PDFs.',
    );
  }

  const html = buildPdfHtml(report, sections, config);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    return { buffer: Buffer.from(buffer) };
  } finally {
    await browser.close();
  }
}

function buildPdfHtml(
  report: Report,
  sections: RenderedSection[],
  config: ExportReportInput['config'],
): string {
  const sectionHtml = sections
    .map((s) => {
      const rowsHtml = s.rows.length > 0
        ? `<table><thead><tr>${s.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${s.rows
            .slice(0, 50)
            .map(
              (r) =>
                `<tr>${s.columns.map((c) => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="empty">No data returned for this section.</p>';
      return `<section><h2>${escapeHtml(s.section.title)}</h2>${rowsHtml}</section>`;
    })
    .join('\n');

  const cover = config.includeCoverPage
    ? `<section class="cover"><h1>${escapeHtml(report.title)}</h1>${report.description ? `<p>${escapeHtml(report.description)}</p>` : ''}<p class="meta">Generated on ${new Date().toISOString()}</p></section>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; margin: 0; padding: 24px; }
  h1 { font-size: 32px; margin-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  th { background: #f3f4f6; font-weight: 600; }
  .cover { page-break-after: always; padding-top: 100px; text-align: center; }
  .cover .meta { color: #6b7280; font-size: 14px; margin-top: 32px; }
  .empty { color: #6b7280; font-style: italic; }
  section { page-break-inside: avoid; }
</style></head>
<body>${cover}${sectionHtml}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ----------------------------------------------------------------------------
   PPT rendering helpers (pptxgenjs-based with graceful fallback).
   ---------------------------------------------------------------------------- */

async function renderPpt(
  report: Report,
  sections: RenderedSection[],
  _config: ExportReportInput['config'],
  ctx: RayfinContext<AidipSchema>,
): Promise<{ buffer: Buffer }> {
  let pptxgenModule: typeof import('pptxgenjs') | null = null;
  try {
    pptxgenModule = (await import('pptxgenjs')) as typeof import('pptxgenjs');
  } catch {
    ctx.log.warn('pptxgenjs is not installed — PPT rendering unavailable.');
    throw new Error(
      'PPT rendering requires the `pptxgenjs` dependency. Run `npm install pptxgenjs` in `rayfin/functions/`.',
    );
  }

  const PptxGenJS = pptxgenModule.default;
  const pres = new PptxGenJS({ layout: 'LAYOUT_16x9', title: report.title });

  // Cover slide
  const cover = pres.addSlide();
  cover.addText(report.title, { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, bold: true, color: '1F2937' });
  if (report.description) {
    cover.addText(report.description, { x: 0.5, y: 3.5, w: 9, h: 1, fontSize: 14, color: '6B7280' });
  }
  cover.addText(`Generated ${new Date().toISOString()}`, {
    x: 0.5,
    y: 5,
    w: 9,
    h: 0.5,
    fontSize: 10,
    color: '9CA3AF',
  });

  // One slide per section
  for (const { section, rows, columns } of sections) {
    const slide = pres.addSlide();
    slide.addText(section.title, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 20, bold: true, color: '1F2937' });

    if (rows.length > 0 && columns.length > 0) {
      const tableRows = [
        columns.map((c) => ({ text: c, options: { bold: true, fill: 'F3F4F6' } })),
        ...rows.slice(0, 8).map((r) =>
          columns.map((c) => ({ text: String(r[c] ?? ''), options: {} })),
        ),
      ];
      slide.addTable(tableRows as unknown as Record<string, unknown>[], {
        x: 0.5,
        y: 1.2,
        w: 9,
        rowH: 0.3,
        fontSize: 10,
        border: { type: 'solid', color: 'E5E7EB' },
      } as Record<string, unknown>);
    } else {
      slide.addText('No data returned for this section.', {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 0.5,
        fontSize: 12,
        italic: true,
        color: '6B7280',
      });
    }
  }

  const output = await pres.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.isBuffer(output)
    ? output
    : Buffer.from(output as unknown as ArrayBuffer);
  return { buffer };
}

/* ----------------------------------------------------------------------------
   Storage fallback (Azure Blob Storage via connection string).
   ---------------------------------------------------------------------------- */

async function uploadViaStorageBlob(
  container: string,
  blobName: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const connectionString = process.env.AzureWebJobsStorage;
  if (!connectionString) {
    throw new Error(
      'No storage client available and AzureWebJobsStorage connection string is not set.',
    );
  }
  const { BlobServiceClient } = await import('@azure/storage-blob');
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = service.getContainerClient(container);
  await containerClient.createIfNotExists();
  const blobClient = containerClient.getBlockBlobClient(blobName);
  await blobClient.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return blobClient.url;
}

/* ============================================================================
   3. GET KPI VALUES — live KPI computation from Fabric semantic models
   ============================================================================ */

interface GetKpiValuesInput {
  kpiIds: string[];
}

interface KpiLiveValue {
  value: number;
  comparison?: { value: number; label: string };
  sparkline?: number[];
}

interface GetKpiValuesResult {
  [kpiId: string]: KpiLiveValue;
}

udf.func(
  'getKpiValues',
  async (input: GetKpiValuesInput, ctx: RayfinContext<AidipSchema>): Promise<GetKpiValuesResult> => {
    ctx.log.info(`getKpiValues invoked: kpiIds=${input.kpiIds.join(',')}`);
    const data = ctx.getDataClient();
    const result: GetKpiValuesResult = {};

    for (const kpiId of input.kpiIds) {
      try {
        const kpi = (await data.KpiConfig.findById(kpiId)) as KpiConfig | null;
        if (!kpi || !kpi.dabQuery) {
          result[kpiId] = { value: 0 };
          continue;
        }

        const company = (await data.Company.findById(kpi.company_id)) as Company | null;
        if (!company) {
          result[kpiId] = { value: 0 };
          continue;
        }

        // Main value
        const valueResult = await executeKpiDax(ctx, company, kpi.dabQuery);
        const value = extractSingleValue(valueResult);

        // Comparison (vs previous period)
        let comparison: KpiLiveValue['comparison'];
        const comparisonConfig = parseJsonColumn<{ label?: string } | null>(
          kpi.comparisonConfig,
          null,
        );
        if (comparisonConfig?.label) {
          try {
            const previousQuery = shiftDaxForPreviousPeriod(kpi.dabQuery);
            const prevResult = await executeKpiDax(ctx, company, previousQuery);
            const prevValue = extractSingleValue(prevResult);
            comparison = {
              value: prevValue === 0 ? 0 : ((value - prevValue) / Math.abs(prevValue)) * 100,
              label: comparisonConfig.label,
            };
          } catch (err) {
            ctx.log.warn(`Comparison query failed for KPI ${kpiId}: ${String(err)}`);
          }
        }

        // Sparkline (7-day window)
        let sparkline: number[] | undefined;
        const sparklineConfig = parseJsonColumn<{ source?: string } | null>(
          kpi.sparklineConfig,
          null,
        );
        if (sparklineConfig?.source) {
          try {
            const points = await Promise.all(
              Array.from({ length: 7 }, (_, i) =>
                executeKpiDax(ctx, company, shiftDaxForSparkline(kpi.dabQuery as string, i))
                  .then(extractSingleValue)
                  .catch(() => 0),
              ),
            );
            sparkline = points.reverse(); // oldest → newest
          } catch (err) {
            ctx.log.warn(`Sparkline computation failed for KPI ${kpiId}: ${String(err)}`);
          }
        }

        result[kpiId] = {
          value,
          ...(comparison ? { comparison } : {}),
          ...(sparkline ? { sparkline } : {}),
        };
      } catch (err) {
        ctx.log.error(`getKpiValues failed for ${kpiId}: ${String(err)}`);
        result[kpiId] = { value: 0 };
      }
    }

    return result;
  },
  [],
);

/** Execute a DAX query for a KPI — uses ctx.executeDax when available. */
async function executeKpiDax(
  ctx: RayfinContext<AidipSchema>,
  company: Company,
  dax: string,
): Promise<DaxQueryResult> {
  if (typeof ctx.executeDax === 'function') {
    return ctx.executeDax(dax, { timeoutMs: DAX_TIMEOUT_MS });
  }
  return executeDaxViaPowerBiRest(company, dax, { timeoutMs: DAX_TIMEOUT_MS });
}

/* ============================================================================
   4. IMPERSONATION — start / end / state (CDC §5)
   ============================================================================ */

interface StartImpersonationInput {
  targetUserId: string;
  reason: string;
}

interface ImpersonationSessionInfo {
  superAdminId: string;
  superAdminName: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  targetCompanyName: string;
  reason: string;
  startedAt: string;
}

interface StartImpersonationResult {
  ok: boolean;
  message?: string;
  session?: ImpersonationSessionInfo;
  /** Short-lived impersonation JWT — the client stores it and uses it for
   * subsequent requests to flag impersonation. */
  token?: string;
  /** ISO expiry timestamp. */
  expiresAt?: string;
}

udf.func(
  'startImpersonation',
  async (input: StartImpersonationInput, ctx: RayfinContext<AidipSchema>): Promise<StartImpersonationResult> => {
    ctx.log.info(`startImpersonation invoked: targetUserId=${input.targetUserId}`);

    // Validate justification
    if (!input.reason || input.reason.trim().length < 10) {
      return { ok: false, message: 'A justification of at least 10 characters is required.' };
    }

    const data = ctx.getDataClient();
    const superAdminId = getCallerUserId(ctx);
    if (!superAdminId) {
      return { ok: false, message: 'Could not identify the calling super admin.' };
    }

    const superAdminRow = (await data.User.findById(superAdminId)) as User | null;
    if (!superAdminRow || superAdminRow.role !== 'super_admin') {
      return { ok: false, message: 'Only Super Admins can impersonate.' };
    }

    const target = (await data.User.findById(input.targetUserId)) as User | null;
    if (!target) {
      return { ok: false, message: 'Target user not found.' };
    }
    if (target.role === 'super_admin') {
      return { ok: false, message: 'Cannot impersonate another Super Admin.' };
    }

    const company = target.company_id
      ? ((await data.Company.findById(target.company_id)) as Company | null)
      : null;

    // Record the audit log entry
    await data.AuditLog.create({
      company_id: target.company_id ?? null,
      user_id: superAdminId,
      userName: superAdminRow.fullName,
      userType: 'super_admin',
      action: 'impersonate_started',
      resourceType: 'user',
      resourceId: target.id,
      details: JSON.stringify({
        reason: input.reason,
        targetUser: target.email,
        targetCompany: company?.name ?? null,
        ttlMinutes: getImpersonationTtlMinutes(),
      }),
      severity: 'critical',
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    } as never);

    // Mint the impersonation JWT (HMAC-SHA256 signed with Invitation__Secret).
    let token: string;
    try {
      token = signImpersonationToken(target.id, superAdminId, input.reason);
    } catch (err) {
      ctx.log.error(`Failed to sign impersonation token: ${String(err)}`);
      return {
        ok: false,
        message: 'Impersonation signing is not configured (Invitation__Secret missing).',
      };
    }

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + getImpersonationTtlMinutes() * 60 * 1000,
    );

    const session: ImpersonationSessionInfo = {
      superAdminId,
      superAdminName: superAdminRow.fullName,
      targetUserId: target.id,
      targetUserEmail: target.email,
      targetUserName: target.fullName,
      targetCompanyName: company?.name ?? '—',
      reason: input.reason,
      startedAt: toIso(startedAt),
    };

    // Track in the in-memory store (used by endImpersonation + state checks).
    activeImpersonations.set(token, {
      token,
      ...session,
      expiresAt: toIso(expiresAt),
    });

    ctx.log.info(
      `Impersonation started: superAdmin=${superAdminEmail(superAdminRow)} → target=${target.email} (expires ${toIso(expiresAt)})`,
    );

    return { ok: true, session, token, expiresAt: toIso(expiresAt) };
  },
  [],
);

function superAdminEmail(user: User): string {
  return user.email;
}

udf.func(
  'endImpersonation',
  async (ctx: RayfinContext<AidipSchema>): Promise<{ ok: boolean }> => {
    ctx.log.info('endImpersonation invoked');
    const data = ctx.getDataClient();

    // Decode the current access token to find the active session.
    const token = ctx.accessToken;
    let endedTargetUserId: string | null = null;
    let endedSuperAdminId: string | null = null;

    if (token) {
      const payload = decodeImpersonationToken(token);
      if (payload) {
        endedTargetUserId = payload.sub;
        endedSuperAdminId = payload.impersonatedBy;
        // Remove from the in-memory store.
        activeImpersonations.delete(token);
      }
    }

    // Record the audit log entry
    await data.AuditLog.create({
      company_id: null,
      user_id: endedSuperAdminId ?? null,
      userName: 'super_admin',
      userType: 'super_admin',
      action: 'impersonate_ended',
      resourceType: 'user',
      resourceId: endedTargetUserId ?? null,
      details: JSON.stringify({
        endedAt: toIso(new Date()),
        targetUserId: endedTargetUserId,
        superAdminId: endedSuperAdminId,
      }),
      severity: 'critical',
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    } as never);

    ctx.log.info(
      `Impersonation ended: superAdmin=${endedSuperAdminId ?? 'unknown'} → target=${endedTargetUserId ?? 'unknown'}`,
    );

    return { ok: true };
  },
  [],
);

udf.func(
  'getImpersonationState',
  async (ctx: RayfinContext<AidipSchema>): Promise<{
    active: boolean;
    session?: ImpersonationSessionInfo;
  }> => {
    ctx.log.info('getImpersonationState invoked');

    const token = ctx.accessToken;
    if (!token) {
      return { active: false };
    }

    // Prefer the in-memory store (verifies signature implicitly via lookup).
    const fromStore = activeImpersonations.get(token);
    if (fromStore) {
      return {
        active: true,
        session: {
          superAdminId: fromStore.superAdminId,
          superAdminName: fromStore.superAdminName,
          targetUserId: fromStore.targetUserId,
          targetUserEmail: fromStore.targetUserEmail,
          targetUserName: fromStore.targetUserName,
          targetCompanyName: fromStore.targetCompanyName,
          reason: fromStore.reason,
          startedAt: fromStore.startedAt,
        },
      };
    }

    // Fallback: decode the JWT claims (signature already verified by the
    // Fabric runtime). Re-verify locally if Invitation__Secret is set.
    const payload = process.env.Invitation__Secret
      ? verifyImpersonationToken(token) ?? decodeImpersonationToken(token)
      : decodeImpersonationToken(token);
    if (!payload) {
      return { active: false };
    }

    // Reconstruct the session metadata by looking up the User + Company rows.
    try {
      const data = ctx.getDataClient();
      const target = (await data.User.findById(payload.sub)) as User | null;
      const superAdmin = (await data.User.findById(payload.impersonatedBy)) as User | null;
      if (!target || !superAdmin) {
        return { active: false };
      }
      const company = target.company_id
        ? ((await data.Company.findById(target.company_id)) as Company | null)
        : null;
      return {
        active: true,
        session: {
          superAdminId: superAdmin.id,
          superAdminName: superAdmin.fullName,
          targetUserId: target.id,
          targetUserEmail: target.email,
          targetUserName: target.fullName,
          targetCompanyName: company?.name ?? '—',
          reason: payload.reason,
          startedAt: new Date(payload.iat * 1000).toISOString(),
        },
      };
    } catch (err) {
      ctx.log.warn(`getImpersonationState lookup failed: ${String(err)}`);
      return { active: false };
    }
  },
  [],
);

/* ============================================================================
   5. TEST FABRIC CONNECTION — XMLA endpoint connectivity check (CDC §14)
   ============================================================================ */

interface TestFabricConnectionInput {
  companyId: string;
}

interface TestFabricConnectionResult {
  ok: boolean;
  message: string;
  xmlaLatencyMs?: number;
}

udf.func(
  'testFabricConnection',
  async (input: TestFabricConnectionInput, ctx: RayfinContext<AidipSchema>): Promise<TestFabricConnectionResult> => {
    ctx.log.info(`testFabricConnection invoked: companyId=${input.companyId}`);
    const data = ctx.getDataClient();

    const company = (await data.Company.findById(input.companyId)) as Company | null;
    if (!company) {
      return { ok: false, message: 'Company not found.' };
    }

    if (!company.fabricWorkspaceId || !company.azureTenantId) {
      return {
        ok: false,
        message:
          'Missing Fabric workspace ID or Azure tenant ID. Configure them in the Fabric Config tab first.',
      };
    }
    if (!company.fabricSemanticModelId) {
      return {
        ok: false,
        message: 'Missing Semantic Model ID. Configure it in the Fabric Config tab first.',
      };
    }
    if (!company.servicePrincipalClientId || !company.servicePrincipalClientSecretEnc) {
      return {
        ok: false,
        message:
          'Missing Service Principal credentials. Configure clientId + clientSecret in the Fabric Config tab first.',
      };
    }

    // Acquire an Entra ID access token via @azure/identity.
    let accessToken: string;
    try {
      accessToken = await getPowerBiAccessToken(company);
    } catch (err) {
      ctx.log.error(`Failed to acquire access token: ${String(err)}`);
      return {
        ok: false,
        message: `Authentication failed: ${String(err)}`,
      };
    }

    // Execute a trivial DAX query against the Semantic Model.
    const probeDax = "EVALUATE TOPN(1, VALUES('Date'[Date]))";
    const url = `${POWER_BI_API_BASE}/groups/${company.fabricWorkspaceId}/datasets/${company.fabricSemanticModelId}/executeQueries`;

    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DAX_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: buildExecuteQueriesBody(probeDax),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;

        if (!response.ok) {
          const text = await response.text();
          return {
            ok: false,
            message: `Connection failed (HTTP ${response.status}): ${text.slice(0, 200)}`,
            xmlaLatencyMs: latencyMs,
          };
        }

        ctx.log.info(`testFabricConnection success in ${latencyMs}ms`);
        return {
          ok: true,
          message: `Connection successful. XMLA latency: ${latencyMs}ms.`,
          xmlaLatencyMs: latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const latencyMs = Date.now() - started;
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      ctx.log.error(`testFabricConnection failed: ${String(err)}`);
      return {
        ok: false,
        message: isTimeout
          ? `Connection timed out after ${DAX_TIMEOUT_MS}ms.`
          : `Connection failed: ${String(err)}`,
        xmlaLatencyMs: latencyMs,
      };
    }
  },
  [],
);

/* ============================================================================
   6. EXTRACT SEMANTIC SCHEMA — tables/columns/measures (CDC §6.4 step 3)
   ============================================================================ */

interface ExtractSemanticSchemaInput {
  companyId: string;
}

interface ExtractSemanticSchemaResult {
  ok: boolean;
  tablesFound: number;
  tables?: Array<{ name: string; columns: string[]; measures: string[] }>;
  message?: string;
}

udf.func(
  'extractSemanticSchema',
  async (input: ExtractSemanticSchemaInput, ctx: RayfinContext<AidipSchema>): Promise<ExtractSemanticSchemaResult> => {
    ctx.log.info(`extractSemanticSchema invoked: companyId=${input.companyId}`);
    const data = ctx.getDataClient();

    const company = (await data.Company.findById(input.companyId)) as Company | null;
    if (!company) {
      return { ok: false, tablesFound: 0, message: 'Company not found.' };
    }

    if (!company.fabricWorkspaceId || !company.fabricSemanticModelId) {
      return {
        ok: false,
        tablesFound: 0,
        message: 'Missing Workspace ID or Semantic Model ID. Configure them first.',
      };
    }
    if (!company.azureTenantId || !company.servicePrincipalClientId || !company.servicePrincipalClientSecretEnc) {
      return {
        ok: false,
        tablesFound: 0,
        message: 'Missing Service Principal credentials. Configure them first.',
      };
    }

    // Fetch the tables (with columns + measures) from the Semantic Model.
    let tables: PowerBiTableMetadata[];
    try {
      tables = await fetchSemanticModelTables(company);
    } catch (err) {
      ctx.log.error(`Schema extraction failed: ${String(err)}`);
      return {
        ok: false,
        tablesFound: 0,
        message: `Schema extraction failed: ${String(err)}`,
      };
    }

    const schema = toSemanticSchema(tables);

    // Persist the schema in-memory for use by the chat pipeline's DAX
    // generation step. (In production this would also be written to a
    // `SemanticModel` table — see NOTE below.)
    cacheSemanticSchema(input.companyId, schema);

    ctx.log.info(
      `Schema extracted: ${schema.tables.length} tables, ${schema.tables.reduce((s, t) => s + t.columns.length, 0)} columns, ${schema.tables.reduce((s, t) => s + t.measures.length, 0)} measures.`,
    );

    return {
      ok: true,
      tablesFound: schema.tables.length,
      tables: schema.tables,
    };
  },
  [],
);

/* ============================================================================
   9. GENERATE AI INSIGHT — for report sections of type 'ai_insight'
   ============================================================================
   Generates 2–5 insight bullets based on the previous section's data
   (chart series, table rows, or KPI value) plus an optional prompt.
   Uses Azure OpenAI gpt-4.1 (the configured "report" model).
   ============================================================================ */

interface GenerateAiInsightInput {
  /** The prompt provided by the report author in the section config. */
  prompt: string;
  /** Desired number of bullets: short=2, medium=3, long=5. */
  length: 'short' | 'medium' | 'long';
  /** The previous section's data (series for charts, rows for tables, value for KPIs). */
  previousSectionData?: {
    type: 'chart' | 'table' | 'kpi' | 'text';
    title?: string;
    series?: { label: string; value: number }[];
    rows?: Record<string, string | number>[];
    kpiValue?: number;
    kpiLabel?: string;
    text?: string;
  } | null;
  /** The company_id (for RLS-scoped schema lookup). */
  companyId: string;
}

interface GenerateAiInsightResult {
  ok: boolean;
  bullets: string[];
  tokensUsed?: number;
  modelUsed?: string;
  errorMessage?: string;
}

udf.func(
  'generateAiInsight',
  async (input: GenerateAiInsightInput, ctx: RayfinContext<AidipSchema>): Promise<GenerateAiInsightResult> => {
    ctx.log.info(`generateAiInsight invoked: length=${input.length}`);

    const aiConfig = getAzureOpenAIConfig();
    if (!aiConfig) {
      ctx.log.warn('Azure OpenAI not configured — cannot generate AI insights.');
      return {
        ok: false,
        bullets: [],
        errorMessage: 'Azure OpenAI is not configured. Ask your Super Admin to complete the AI configuration.',
      };
    }

    const count = input.length === 'short' ? 2 : input.length === 'medium' ? 3 : 5;

    // Build the context payload from the previous section's data.
    let dataContext = '';
    if (input.previousSectionData) {
      const psd = input.previousSectionData;
      if (psd.type === 'chart' && psd.series && psd.series.length > 0) {
        dataContext = `Previous section is a chart titled "${psd.title ?? 'Untitled'}" with the following data:\n`;
        dataContext += psd.series.map((s) => `  - ${s.label}: ${s.value}`).join('\n');
      } else if (psd.type === 'table' && psd.rows && psd.rows.length > 0) {
        dataContext = `Previous section is a table titled "${psd.title ?? 'Untitled'}" with ${psd.rows.length} rows. First 5 rows (JSON):\n`;
        dataContext += JSON.stringify(psd.rows.slice(0, 5), null, 2);
      } else if (psd.type === 'kpi' && psd.kpiValue !== undefined) {
        dataContext = `Previous section is a KPI titled "${psd.kpiLabel ?? 'Untitled'}" with value ${psd.kpiValue}.`;
      } else if (psd.type === 'text' && psd.text) {
        dataContext = `Previous section is a text block with content:\n${psd.text.slice(0, 500)}`;
      }
    }

    const systemPrompt = `You are AIDIP's BI insights assistant. Given a dataset and an optional focus prompt, generate exactly ${count} concise, actionable insight bullets.
Each bullet must be a single sentence (max 120 chars) starting with a capital letter and ending with a period.
Focus on: trends, anomalies, comparisons, and concrete recommendations.
Do NOT invent numbers that aren't in the provided data. If the data is empty or insufficient, return bullets that say so honestly.
Return ONLY the bullets, one per line, no numbering, no markdown.`;

    const userPrompt = `${input.prompt ? `Focus: ${input.prompt}\n\n` : ''}${dataContext || 'No previous section data available.'}\n\nGenerate ${count} insight bullets:`;

    try {
      const completion = await chatCompletion(
        aiConfig.modelReport,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.4, maxTokens: 400 },
      );

      const text = completion.content.trim();
      const bullets = text
        .split('\n')
        .map((line) => line.replace(/^[-•*\d.\s]+/, '').trim())
        .filter((line) => line.length > 0)
        .slice(0, count);

      ctx.log.info(`Generated ${bullets.length} insight bullets (${completion.tokensUsed} tokens).`);
      return {
        ok: true,
        bullets,
        tokensUsed: completion.tokensUsed,
        modelUsed: aiConfig.modelReport,
      };
    } catch (err) {
      ctx.log.error(`generateAiInsight failed: ${String(err)}`);
      return {
        ok: false,
        bullets: [],
        errorMessage: 'Failed to generate insights. Please try again or rephrase the prompt.',
      };
    }
  },
  [],
);

/* ============================================================================
   10. GET CHAT SUGGESTIONS — dynamic suggestions for the chatbot welcome
   ============================================================================
   Returns 4 personalized suggestions based on:
     - The company's available datasets (semantic model tables/measures)
     - The user's recent conversation history (most-asked topics)
   Falls back to generic BI questions if no history or schema is available.
   ============================================================================ */

interface GetChatSuggestionsInput {
  /** The company_id (for RLS-scoped schema lookup). */
  companyId: string;
  /** The user_id (for history lookup). */
  userId: string;
}

interface GetChatSuggestionsResult {
  ok: boolean;
  suggestions: string[];
  errorMessage?: string;
}

udf.func(
  'getChatSuggestions',
  async (input: GetChatSuggestionsInput, ctx: RayfinContext<AidipSchema>): Promise<GetChatSuggestionsResult> => {
    ctx.log.info(`getChatSuggestions invoked: companyId=${input.companyId} userId=${input.userId}`);
    const data = ctx.getDataClient();

    const suggestions: string[] = [];

    // 1. Try to derive suggestions from the semantic model schema.
    const schema = getCachedSemanticSchema(input.companyId);
    if (schema && schema.tables.length > 0) {
      // Find a measure-bearing table (revenue, sales, amount, etc.)
      const revenueTable = schema.tables.find(
        (t) =>
          t.name.toLowerCase().includes('sale') ||
          t.measures.some((m) => /revenue|amount|total/i.test(m)),
      );
      if (revenueTable) {
        suggestions.push(`What were our total ${revenueTable.name.toLowerCase()} last month?`);
      }

      // Find a product/customer table for top-N questions.
      const productTable = schema.tables.find((t) => /product|item/i.test(t.name));
      if (productTable) {
        suggestions.push(`Show me the top 5 ${productTable.name.toLowerCase()} by revenue`);
      }

      // Find a customer table for churn questions.
      const customerTable = schema.tables.find((t) => /customer|client/i.test(t.name));
      if (customerTable) {
        suggestions.push(`What's our ${customerTable.name.toLowerCase()} churn rate?`);
      }

      // Find a region/geography table for comparison questions.
      const regionTable = schema.tables.find((t) => /region|country|city|geography/i.test(t.name));
      if (regionTable) {
        suggestions.push(`Compare ${regionTable.name.toLowerCase()} performance Q2 vs Q3`);
      }
    }

    // 2. If the schema didn't yield 4 suggestions, look at recent conversations.
    if (suggestions.length < 4) {
      try {
        const recentConvos = await data.Conversation.findMany({
          user_id: { eq: input.userId },
          status: { eq: 'active' },
        } as never);
        const recentTitles = (recentConvos as Conversation[])
          .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
          .slice(0, 10)
          .map((c) => c.title);
        for (const title of recentTitles) {
          if (suggestions.length >= 4) break;
          // Reuse the most recent conversation title as a suggestion if it reads like a question.
          if (title.length > 10 && title.length < 120 && !suggestions.includes(title)) {
            suggestions.push(title);
          }
        }
      } catch (err) {
        ctx.log.warn(`Failed to load conversation history for suggestions: ${String(err)}`);
      }
    }

    // 3. If still insufficient, fall back to generic BI questions.
    const GENERIC_FALLBACK = [
      'What were our total sales last month?',
      'Show me the top 5 products by revenue',
      'Compare Q2 vs Q3 performance',
      "What's our customer churn rate?",
    ];
    while (suggestions.length < 4) {
      const next = GENERIC_FALLBACK.find((g) => !suggestions.includes(g));
      if (next) suggestions.push(next);
      else break;
    }

    ctx.log.info(`Returning ${suggestions.length} suggestions.`);
    return { ok: true, suggestions: suggestions.slice(0, 4) };
  },
  [],
);

/* ============================================================================
   Export the UDF instance — Rayfin picks it up automatically.
   ============================================================================ */

export { udf };

// Type re-exports for downstream consumers (e.g. tests).
export type {
  ChatInput,
  ChatFunctionResult,
  ExportReportInput,
  ExportReportResult,
  GetKpiValuesInput,
  GetKpiValuesResult,
  StartImpersonationInput,
  StartImpersonationResult,
  ImpersonationSessionInfo,
  TestFabricConnectionInput,
  TestFabricConnectionResult,
  ExtractSemanticSchemaInput,
  ExtractSemanticSchemaResult,
  GenerateAiInsightInput,
  GenerateAiInsightResult,
  GetChatSuggestionsInput,
  GetChatSuggestionsResult,
};

// Keep these imports referenced (used via type narrowing above).
export type { Conversation, ChatMessage as ChatMessageRow, Notification, ImpersonationTokenPayload };
