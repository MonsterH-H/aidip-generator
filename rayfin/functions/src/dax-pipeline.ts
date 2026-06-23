/**
 * DAX pipeline helpers — shared between the `chat` UDF and any future
 * function that needs to translate natural-language questions into DAX
 * and format the resulting rows.
 *
 * Pipeline steps implemented here (CDC §6.4):
 *   - Step 2: `analyzeIntent()`           — gpt-4o-mini classifies the question
 *   - Step 3: `generateDax()`             — gpt-4o-mini/gpt-4.1 emits a DAX query
 *   - Step 5A: `analyzeAndFormat()`       — gpt-4.1 produces a natural-language
 *                                            summary + insights; deterministic
 *                                            fallback picks the viz type + table.
 *
 * All three helpers throw `Error('ai_unavailable')` if Azure OpenAI is not
 * configured. Callers should catch this and surface an
 * `errorKind: 'ai_unavailable'` to the client.
 */

import { chatCompletion, getAzureOpenAIConfig, type AiChatMessage } from './azure-openai.js';

// ============================================================================
// Types
// ============================================================================

export type IntentType = 'Simple' | 'Comparative' | 'Analytical' | 'Predictive';
export type IntentComplexity = 'Low' | 'Medium' | 'High';

export interface IntentAnalysis {
  intent: IntentType;
  complexity: IntentComplexity;
  reasoning: string;
}

export interface SemanticModelSchema {
  tables: Array<{
    name: string;
    columns: string[];
    measures: string[];
  }>;
}

export interface DaxGenerationResult {
  dax: string;
  tokensUsed: number;
}

export interface ChatVisualization {
  type: 'line' | 'bar' | 'pie' | 'area' | 'kpi';
  title: string;
  source: string;
  series: { label: string; value: number }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface ChatTableColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'integer' | 'date' | 'text';
}

export interface ChatTable {
  columns: ChatTableColumn[];
  rows: Record<string, string | number>[];
  totalRows: number;
}

export interface ChatInsight {
  kind: 'trend' | 'anomaly' | 'recommendation';
  text: string;
}

export interface AnalysisResult {
  text: string;
  insights: ChatInsight[];
  visualization?: ChatVisualization;
  table?: ChatTable;
}

// ============================================================================
// Few-shot examples — generic, language-agnostic DAX patterns.
// ============================================================================

const FEW_SHOT_EXAMPLES: Array<{ question: string; dax: string }> = [
  {
    question: 'Total revenue this month',
    dax: "EVALUATE\nROW(\"Total Revenue\", [TotalRevenue])",
  },
  {
    question: 'Top 5 products by sales',
    dax: "EVALUATE\nTOPN(\n  5,\n  SUMMARIZECOLUMNS('Product'[Name], \"Sales\", [SalesAmount]),\n  [Sales], DESC\n)",
  },
  {
    question: 'Monthly revenue trend for the last 12 months',
    dax: "EVALUATE\nSUMMARIZECOLUMNS(\n  DATESINPERIOD('Date'[Date], TODAY(), -12, MONTH),\n  \"Revenue\", [TotalRevenue]\n)\nORDER BY 'Date'[Date]",
  },
  {
    question: 'Revenue by region',
    dax: "EVALUATE\nSUMMARIZECOLUMNS('Geography'[Region], \"Revenue\", [TotalRevenue])",
  },
];

// ============================================================================
// Prompts
// ============================================================================

const SYSTEM_PROMPT_INTENT = `You are an intent classifier for a BI chatbot. Classify the user's question:
- intent: one of "Simple" (single metric/fact), "Comparative" (compare 2+ groups/periods), "Analytical" (trend/pattern/anomaly), "Predictive" (forecast)
- complexity: one of "Low" (1 metric), "Medium" (2-3 metrics or simple breakdown), "High" (multi-dimension analysis)

Respond as JSON: {"intent": "...", "complexity": "...", "reasoning": "..."}`;

function buildDaxSystemPrompt(schema: SemanticModelSchema | null): string {
  const schemaText = schema && schema.tables.length > 0
    ? schema.tables
        .map(
          (t) =>
            `Table "${t.name}": columns=[${t.columns.join(', ')}], measures=[${t.measures.join(', ')}]`,
        )
        .join('\n')
    : '(schema not available — use generic DAX patterns and assume standard tables like Sales, Product, Date, Geography)';

  const fewShotText = FEW_SHOT_EXAMPLES.map(
    (ex) => `Q: ${ex.question}\nDAX:\n${ex.dax}`,
  ).join('\n\n');

  return [
    'You are a DAX query generator for a Power BI / Fabric semantic model.',
    '',
    'Schema:',
    schemaText,
    '',
    'Rules:',
    '- Generate ONLY valid DAX. Return the DAX query and nothing else.',
    '- No markdown, no code fences, no explanation.',
    '- Always start with EVALUATE.',
    '- Use SUMMARIZECOLUMNS for grouped aggregations.',
    '- Use TOPN for "top N" requests.',
    '- Use DATESINPERIOD or DATESBETWEEN for time-based filters.',
    '- Prefer measures (in square brackets) over re-computing aggregations.',
    '',
    'Few-shot examples:',
    fewShotText,
  ].join('\n');
}

const SYSTEM_PROMPT_ANALYSIS = `You are a BI analyst. Given:
- The user's question
- The DAX query executed
- The data rows returned (as JSON, truncated)
- Descriptive statistics on the numeric columns

Produce a concise natural-language answer (1-2 sentences) and 2-3 insight bullets.
- Use ACTUAL numbers from the data. Do NOT invent or hallucinate.
- If data is empty, say "No data was found" and return empty insights.
- Insight kinds: "trend" (direction/evolution), "anomaly" (outlier/skew), "recommendation" (actionable).

Respond as JSON: {"summary": "...", "insights": [{"kind": "...", "text": "..."}]}`;

// ============================================================================
// Step 2 — Intent analysis
// ============================================================================

const VALID_INTENTS: IntentType[] = ['Simple', 'Comparative', 'Analytical', 'Predictive'];
const VALID_COMPLEXITIES: IntentComplexity[] = ['Low', 'Medium', 'High'];

export async function analyzeIntent(
  question: string,
  conversationHistory: AiChatMessage[] = [],
): Promise<IntentAnalysis> {
  const config = getAzureOpenAIConfig();
  if (!config) throw new Error('ai_unavailable');

  const messages: AiChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT_INTENT },
    ...conversationHistory.slice(-3),
    { role: 'user', content: question },
  ];

  const result = await chatCompletion(config.modelFast, messages, {
    temperature: 0.1,
    maxTokens: 300,
    responseFormat: 'json_object',
  });

  try {
    const parsed = JSON.parse(result.content) as Partial<IntentAnalysis>;
    const intent = VALID_INTENTS.includes(parsed.intent as IntentType)
      ? (parsed.intent as IntentType)
      : 'Simple';
    const complexity = VALID_COMPLEXITIES.includes(parsed.complexity as IntentComplexity)
      ? (parsed.complexity as IntentComplexity)
      : 'Low';
    return {
      intent,
      complexity,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    // LLM returned malformed JSON — fall back to safe defaults.
    return { intent: 'Simple', complexity: 'Low', reasoning: 'parse-failure' };
  }
}

// ============================================================================
// Step 3 — DAX generation
// ============================================================================

export async function generateDax(
  question: string,
  schema: SemanticModelSchema | null,
  conversationHistory: AiChatMessage[] = [],
  useComplexModel = false,
): Promise<DaxGenerationResult> {
  const config = getAzureOpenAIConfig();
  if (!config) throw new Error('ai_unavailable');

  const systemPrompt = buildDaxSystemPrompt(schema);
  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-5),
    { role: 'user', content: `Question: ${question}\n\nGenerate the DAX query.` },
  ];

  const result = await chatCompletion(
    useComplexModel ? config.modelComplex : config.modelFast,
    messages,
    { temperature: 0.1, maxTokens: 800 },
  );

  // Strip markdown code fences if the LLM ignored the rule.
  const dax = result.content
    .replace(/^\s*```(?:dax|sql|text)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  return { dax, tokensUsed: result.tokensUsed };
}

// ============================================================================
// Step 5A — Analysis & formatting
// ============================================================================

interface NumericStats {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
}

function computeStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0, count: 0 };
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, min, max, stdDev: Math.sqrt(variance), count: values.length };
}

function inferFormat(
  rows: Record<string, unknown>[],
  col: string,
): 'currency' | 'percent' | 'integer' | 'date' | 'text' {
  const sample = rows
    .slice(0, 20)
    .map((r) => r[col])
    .filter((v) => v !== null && v !== undefined);
  if (sample.length === 0) return 'text';
  if (sample.every((v) => typeof v === 'number' && Number.isInteger(v))) {
    return 'integer';
  }
  if (sample.every((v) => typeof v === 'number')) {
    return 'currency';
  }
  if (
    sample.every(
      (v) =>
        v instanceof Date ||
        (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(Date.parse(v))),
    )
  ) {
    return 'date';
  }
  return 'text';
}

function pickVisualization(
  rows: Record<string, unknown>[],
  columns: string[],
): ChatVisualization | undefined {
  if (rows.length === 0 || columns.length === 0) return undefined;

  const sample = rows[0];
  const textCol = columns.find((c) => typeof sample[c] === 'string');
  const numCol = columns.find((c) => typeof sample[c] === 'number');
  if (!numCol) return undefined;

  // Single-row KPI
  if (rows.length === 1) {
    return {
      type: 'kpi',
      title: 'Result',
      source: 'semantic-model',
      series: [{ label: numCol, value: Number(sample[numCol]) }],
    };
  }

  // Detect date column for line/area charts
  const dateCol = columns.find(
    (c) =>
      typeof sample[c] === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(sample[c] as string),
  );
  if (dateCol) {
    return {
      type: 'line',
      title: `${numCol} over time`,
      source: 'semantic-model',
      series: rows.slice(0, 50).map((r) => ({
        label: String(r[dateCol]),
        value: Number(r[numCol]),
      })),
      xAxisLabel: dateCol,
      yAxisLabel: numCol,
    };
  }

  if (textCol) {
    const cardinality = new Set(rows.map((r) => r[textCol])).size;
    const series = rows
      .slice(0, 12)
      .map((r) => ({ label: String(r[textCol]), value: Number(r[numCol]) }));
    if (cardinality <= 4) {
      return {
        type: 'pie',
        title: `${numCol} by ${textCol}`,
        source: 'semantic-model',
        series,
        xAxisLabel: textCol,
        yAxisLabel: numCol,
      };
    }
    return {
      type: 'bar',
      title: `${numCol} by ${textCol}`,
      source: 'semantic-model',
      series,
      xAxisLabel: textCol,
      yAxisLabel: numCol,
    };
  }

  // Fallback: bar chart of the numeric column
  return {
    type: 'bar',
    title: numCol,
    source: 'semantic-model',
    series: rows.slice(0, 12).map((r, i) => ({
      label: `Row ${i + 1}`,
      value: Number(r[numCol]),
    })),
    yAxisLabel: numCol,
  };
}

function buildTable(
  rows: Record<string, unknown>[],
  columns: string[],
): ChatTable {
  return {
    columns: columns.map((c) => ({
      key: c,
      label: c,
      format: inferFormat(rows, c),
    })),
    rows: rows.slice(0, 100).map((r) => {
      const out: Record<string, string | number> = {};
      for (const c of columns) {
        const v = r[c];
        if (v === null || v === undefined) {
          out[c] = '';
        } else if (typeof v === 'number') {
          out[c] = v;
        } else if (v instanceof Date) {
          out[c] = v.toISOString();
        } else {
          out[c] = String(v);
        }
      }
      return out;
    }),
    totalRows: rows.length,
  };
}

function buildDeterministicInsights(
  rows: Record<string, unknown>[],
  columns: string[],
  stats: Record<string, NumericStats>,
): ChatInsight[] {
  const insights: ChatInsight[] = [];
  const numericCols = columns.filter((c) => stats[c]);

  if (rows.length === 0) return insights;

  if (numericCols.length > 0) {
    const col = numericCols[0];
    const s = stats[col];
    insights.push({
      kind: 'trend',
      text: `${col} ranges from ${s.min.toLocaleString()} to ${s.max.toLocaleString()} (mean ${s.mean.toFixed(2)}).`,
    });
    if (s.count >= 3 && s.stdDev > s.mean * 0.5) {
      insights.push({
        kind: 'anomaly',
        text: `High variability detected in ${col} (std dev ${s.stdDev.toFixed(2)} — over 50% of the mean).`,
      });
    }
    if (s.count >= 5 && numericCols.length >= 2) {
      insights.push({
        kind: 'recommendation',
        text: `Consider breaking ${col} down by ${numericCols[1]} for a sharper view.`,
      });
    }
  } else if (rows.length > 1) {
    insights.push({
      kind: 'trend',
      text: `Query returned ${rows.length} rows. No numeric columns detected for trend analysis.`,
    });
  }
  return insights.slice(0, 3);
}

export async function analyzeAndFormat(
  question: string,
  dax: string,
  rows: Record<string, unknown>[],
  columns: string[],
): Promise<AnalysisResult> {
  const visualization = pickVisualization(rows, columns);
  const table = buildTable(rows, columns);

  // Compute descriptive stats on numeric columns
  const numericCols = columns.filter((c) =>
    rows.some((r) => typeof r[c] === 'number'),
  );
  const stats: Record<string, NumericStats> = {};
  for (const col of numericCols) {
    const values = rows
      .map((r) => Number(r[col]))
      .filter((v) => !isNaN(v) && isFinite(v));
    stats[col] = computeStats(values);
  }

  // If Azure OpenAI is available, generate a natural-language summary
  const config = getAzureOpenAIConfig();
  if (config && rows.length > 0) {
    const sampleRows = rows.slice(0, 20);
    const userContent = [
      `Question: ${question}`,
      '',
      `DAX:`,
      dax,
      '',
      `Data (first ${sampleRows.length} of ${rows.length} rows):`,
      JSON.stringify(sampleRows, null, 2),
      '',
      `Statistics:`,
      JSON.stringify(stats, null, 2),
    ].join('\n');

    try {
      const result = await chatCompletion(
        config.modelComplex,
        [
          { role: 'system', content: SYSTEM_PROMPT_ANALYSIS },
          { role: 'user', content: userContent },
        ],
        { temperature: 0.3, maxTokens: 600, responseFormat: 'json_object' },
      );
      const parsed = JSON.parse(result.content) as {
        summary?: string;
        insights?: Array<{ kind?: string; text?: string }>;
      };
      const validKinds = ['trend', 'anomaly', 'recommendation'] as const;
      const insights: ChatInsight[] = (parsed.insights ?? [])
        .filter((i) => i && typeof i.text === 'string')
        .slice(0, 3)
        .map((i) => ({
          kind: validKinds.includes(i.kind as (typeof validKinds)[number])
            ? (i.kind as (typeof validKinds)[number])
            : 'trend',
          text: i.text as string,
        }));
      return {
        text:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary
            : 'Analysis complete.',
        insights,
        visualization,
        table,
      };
    } catch {
      // Fall through to deterministic fallback below.
    }
  }

  // Deterministic fallback (no AI or AI failure)
  const summary =
    rows.length === 0
      ? 'No data was found matching your request.'
      : numericCols.length > 0
        ? `Query returned ${rows.length} rows. ${numericCols[0]}: mean=${stats[numericCols[0]].mean.toFixed(2)}, min=${stats[numericCols[0]].min}, max=${stats[numericCols[0]].max}.`
        : `Query returned ${rows.length} rows.`;

  return {
    text: summary,
    insights: buildDeterministicInsights(rows, columns, stats),
    visualization,
    table,
  };
}

// ============================================================================
// Semantic schema in-memory cache (populated by `extractSemanticSchema`)
// ============================================================================

const schemaCache = new Map<string, SemanticModelSchema>();

export function cacheSemanticSchema(companyId: string, schema: SemanticModelSchema): void {
  schemaCache.set(companyId, schema);
}

export function getCachedSemanticSchema(companyId: string): SemanticModelSchema | null {
  return schemaCache.get(companyId) ?? null;
}
