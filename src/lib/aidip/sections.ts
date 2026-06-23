/**
 * AIDIP — Report section helpers.
 *
 * Shared utilities for working with `ReportSection` instances across the
 * view and editor pages. Currently exposes a single helper that converts a
 * section into the `previousSectionData` payload expected by the
 * `aidip.chat.generateInsight` Rayfin function.
 */

import type { ReportSection } from './types';

/**
 * Shape of the `previousSectionData` argument accepted by
 * `IChatService.generateInsight`. Mirrors the type declared on the service
 * interface so consumers don't need to re-declare it.
 */
export interface AiInsightPreviousSectionData {
  type: 'chart' | 'table' | 'kpi' | 'text';
  title?: string;
  series?: { label: string; value: number }[];
  rows?: Record<string, string | number>[];
  kpiValue?: number;
  kpiLabel?: string;
  text?: string;
}

/**
 * Converts a `ReportSection` into the `previousSectionData` payload expected
 * by the AI insight generator. Returns `null` if the section has no usable
 * data (e.g. empty chart series / table rows), so the server-side prompt
 * receives an explicit "no data" signal rather than an empty stub.
 */
export function extractPreviousSectionData(
  section: ReportSection | null | undefined,
): AiInsightPreviousSectionData | null {
  if (!section) return null;

  switch (section.type) {
    case 'chart': {
      const chart = section.configuration.chart;
      const series = chart?.series ?? [];
      if (series.length === 0) return null;
      return {
        type: 'chart',
        title: chart?.title ?? section.title,
        series,
      };
    }
    case 'table': {
      const table = section.configuration.table;
      const rows = table?.rows ?? [];
      if (rows.length === 0) return null;
      return {
        type: 'table',
        title: section.title,
        rows,
      };
    }
    case 'kpi': {
      const kpi = section.configuration.kpi;
      if (!kpi) return null;
      return {
        type: 'kpi',
        kpiLabel: kpi.label,
        kpiValue: kpi.value,
      };
    }
    case 'text': {
      const text = section.configuration.text?.content ?? '';
      if (!text.trim()) return null;
      return {
        type: 'text',
        text,
      };
    }
    default:
      return null;
  }
}
