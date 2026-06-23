/**
 * Rayfin-backed AIDIP Search service.
 *
 * Full-text search across conversations, reports, and exports. RLS
 * ensures the user only sees their own conversations, their accessible
 * reports (own + shared + official), and their own exports.
 *
 * The CDC §11.2 mentions Fabric SQL native Full-Text Search — that would
 * be exposed via a Rayfin function. For now we do client-side filtering
 * on the already-fetched rows (works for the typical small dataset per
 * company; the function would be wired in for production-scale tenants).
 */

import type { SearchResult, SearchResultType } from '@/lib/aidip/types';
import type { ISearchService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { getCurrentCompanyId, getCurrentUserId } from './helpers-session';
import { parseJson } from './helpers';

interface RayfinConversationRow {
  id: string;
  user_id: string;
  title: string;
  messageCount: number;
  status: 'active' | 'archived' | 'deleted';
  lastMessageAt: string;
}

interface RayfinReportRow {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: 'draft' | 'published' | 'archived' | 'deleted';
  visibility: 'private' | 'shared' | 'company' | 'official';
  isOfficial: boolean;
  tags: string;
  updatedAt: string;
}

interface RayfinReportSnapshotRow {
  id: string;
  report_id: string;
  format: 'pdf' | 'ppt';
  status: 'processing' | 'completed' | 'failed';
  requestedAt: string;
}

async function getReportTitle(reportId: string): Promise<string> {
  const client = getRayfinClient();
  const r = await client.data.Report.findById(reportId);
  return (r as unknown as { title?: string } | null)?.title ?? '';
}

export class RayfinSearchService implements ISearchService {
  async search(query: string, filters?: { type?: SearchResultType }): Promise<SearchResult[]> {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];

    const client = getRayfinClient();
    const userId = getCurrentUserId();
    const companyId = await getCurrentCompanyId();
    if (!companyId) return [];

    const allowedTypes = filters?.type ? [filters.type] : ['conversation', 'report', 'export'];
    const results: SearchResult[] = [];

    if (allowedTypes.includes('conversation')) {
      const conversations = (await client.data.Conversation.findMany({
        user_id: { eq: userId },
      } as never)) as unknown as RayfinConversationRow[];
      for (const c of conversations.filter((c) => c.status !== 'deleted')) {
        if (c.title.toLowerCase().includes(q)) {
          results.push({
            id: c.id,
            type: 'conversation',
            title: c.title,
            excerpt: `${c.messageCount} messages · last activity ${c.lastMessageAt.slice(0, 10)}`,
            status: c.status,
            timestamp: c.lastMessageAt,
            actionUrl: `/chat/${c.id}`,
          });
        }
      }
    }

    if (allowedTypes.includes('report')) {
      const reports = (await client.data.Report.findMany({
        company_id: { eq: companyId },
      } as never)) as unknown as RayfinReportRow[];
      const myShares = await client.data.ReportShare.findMany({
        sharedWith: { eq: userId },
      } as never);
      const sharedIds = new Set(myShares.map((s) => (s as unknown as { report_id: string }).report_id));
      const visible = reports.filter(
        (r) => r.status !== 'deleted' && (r.user_id === userId || sharedIds.has(r.id) || r.isOfficial),
      );
      for (const r of visible) {
        const tags = parseJson<string[]>(r.tags) ?? [];
        const matches =
          r.title.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          tags.some((t) => t.toLowerCase().includes(q));
        if (matches) {
          results.push({
            id: r.id,
            type: 'report',
            title: r.title,
            excerpt: r.description ?? tags.join(', '),
            status: r.status,
            timestamp: r.updatedAt,
            actionUrl: `/reports/${r.id}`,
          });
        }
      }
    }

    if (allowedTypes.includes('export')) {
      const snapshots = (await client.data.ReportSnapshot.findMany({
        user_id: { eq: userId },
      } as never)) as unknown as RayfinReportSnapshotRow[];
      for (const s of snapshots) {
        const title = await getReportTitle(s.report_id);
        if (title.toLowerCase().includes(q)) {
          results.push({
            id: s.id,
            type: 'export',
            title,
            excerpt: `${s.format.toUpperCase()} · ${s.status}`,
            status: s.status,
            timestamp: s.requestedAt,
            actionUrl: `/reports/${s.report_id}`,
          });
        }
      }
    }

    return results
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20);
  }
}
