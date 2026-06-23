/**
 * Rayfin-backed AIDIP Company service.
 *
 * Manages tenant records — list, get, create, update, suspend, reactivate,
 * soft-delete, Fabric connection test, Semantic Model schema extraction.
 *
 * RLS: super_admin only for cross-tenant operations. The HESYD control-plane
 * Company row is identifiable by NULL domain or notes_internal containing
 * 'HESYD'.
 */

import type { Company } from '@/lib/aidip/types';
import type { ICompanyService } from '@/services/interfaces/IAidipServices';
import { getRayfinClient } from '../RayfinClientService';
import { nowIso } from './helpers';

interface RayfinCompanyRow {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  plan: Company['plan'];
  status: Company['status'];
  maxUsers: number;
  maxQueriesPerDay: number;
  storageGb: number;
  queriesToday: number;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  fabricWorkspaceId?: string | null;
  fabricSemanticModelId?: string | null;
  azureTenantId?: string | null;
  servicePrincipalClientId?: string | null;
  servicePrincipalClientSecretEnc?: string | null;
  xmlaEndpoint?: string | null;
  authType: Company['authType'];
  aiProvider: Company['aiProvider'];
  azureOpenaiEndpoint?: string | null;
  azureOpenaiApiKeyEnc?: string | null;
  modelChatFast: string;
  modelChatComplex: string;
  modelReport: string;
  maxTokensPerRequest: number;
  aiDailyTokenBudget: number;
  defaultTimezone: string;
  defaultCurrency: string;
  logoUrl?: string | null;
  notesInternal?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: RayfinCompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    domain: row.domain ?? null,
    plan: row.plan,
    status: row.status,
    maxUsers: row.maxUsers,
    maxQueriesPerDay: row.maxQueriesPerDay,
    storageGb: row.storageGb,
    queriesToday: row.queriesToday,
    subscriptionStart: row.subscriptionStart ?? null,
    subscriptionEnd: row.subscriptionEnd ?? null,
    fabricWorkspaceId: row.fabricWorkspaceId ?? null,
    fabricSemanticModelId: row.fabricSemanticModelId ?? null,
    azureTenantId: row.azureTenantId ?? null,
    servicePrincipalClientId: row.servicePrincipalClientId ?? null,
    servicePrincipalClientSecretEnc: row.servicePrincipalClientSecretEnc ?? null,
    xmlaEndpoint: row.xmlaEndpoint ?? null,
    authType: row.authType,
    aiProvider: row.aiProvider,
    azureOpenaiEndpoint: row.azureOpenaiEndpoint ?? null,
    azureOpenaiApiKeyEnc: row.azureOpenaiApiKeyEnc ?? null,
    modelChatFast: row.modelChatFast,
    modelChatComplex: row.modelChatComplex,
    modelReport: row.modelReport,
    maxTokensPerRequest: row.maxTokensPerRequest,
    aiDailyTokenBudget: row.aiDailyTokenBudget,
    defaultTimezone: row.defaultTimezone,
    defaultCurrency: row.defaultCurrency,
    logoUrl: row.logoUrl ?? null,
    notesInternal: row.notesInternal ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RayfinCompanyService implements ICompanyService {
  async list(): Promise<Company[]> {
    const client = getRayfinClient();
    const rows = await client.data.Company.findMany();
    return rows
      .filter((r) => r.status !== 'deleted')
      .map((r) => mapRow(r as unknown as RayfinCompanyRow))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Company | null> {
    const client = getRayfinClient();
    const row = await client.data.Company.findById(id);
    if (!row) return null;
    return mapRow(row as unknown as RayfinCompanyRow);
  }

  async create(input: {
    name: string;
    domain?: string;
    plan: Company['plan'];
    maxUsers: number;
    maxQueriesPerDay: number;
    storageGb: number;
    subscriptionStart?: string;
    subscriptionEnd?: string;
  }): Promise<Company> {
    const client = getRayfinClient();
    const now = nowIso();
    const slug = input.name.toLowerCase().replace(/\s+/g, '-');
    const row = await client.data.Company.create({
      name: input.name,
      slug,
      domain: input.domain ?? null,
      plan: input.plan,
      status: 'active',
      maxUsers: input.maxUsers,
      maxQueriesPerDay: input.maxQueriesPerDay,
      storageGb: input.storageGb,
      queriesToday: 0,
      subscriptionStart: input.subscriptionStart ?? now,
      subscriptionEnd: input.subscriptionEnd ?? null,
      authType: 'service_principal',
      aiProvider: 'azure_openai',
      azureOpenaiEndpoint: null,
      azureOpenaiApiKeyEnc: null,
      modelChatFast: 'gpt-4o-mini',
      modelChatComplex: 'gpt-4.1',
      modelReport: 'gpt-4.1',
      maxTokensPerRequest: 8000,
      aiDailyTokenBudget: 200_000,
      defaultTimezone: 'Africa/Casablanca',
      defaultCurrency: 'MAD',
      logoUrl: null,
      notesInternal: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as unknown as ConstructorParameters<typeof Object>[0]);
    return mapRow(row as unknown as RayfinCompanyRow);
  }

  async update(id: string, patch: Partial<Company>): Promise<Company> {
    const client = getRayfinClient();
    const row = await client.data.Company.update({ id }, { ...patch, updatedAt: nowIso() } as never);
    return mapRow(row as unknown as RayfinCompanyRow);
  }

  async suspend(id: string): Promise<Company> {
    return this.update(id, { status: 'suspended' });
  }

  async reactivate(id: string): Promise<Company> {
    return this.update(id, { status: 'active' });
  }

  async softDelete(id: string): Promise<Company> {
    return this.update(id, { status: 'deleted', deletedAt: nowIso() });
  }

  async testFabricConnection(id: string): Promise<{ ok: boolean; message: string }> {
    const client = getRayfinClient();
    const company = await this.get(id);
    if (!company) return { ok: false, message: 'Company not found.' };
    if (!company.fabricWorkspaceId || !company.azureTenantId) {
      return {
        ok: false,
        message:
          'Missing Fabric workspace ID or Azure tenant ID. Configure them in the Fabric Config tab first.',
      };
    }
    // Invoke the server-side Rayfin function that pings the XMLA endpoint
    // with the configured Service Principal. The function is defined in
    // rayfin/functions/src/function_app.ts (testFabricConnection).
    try {
      const result = await client.functions.testFabricConnection.invoke({ companyId: id });
      return { ok: result.ok, message: result.message };
    } catch (err) {
      console.error('testFabricConnection invocation failed:', err);
      return {
        ok: false,
        message: 'Failed to invoke connection test. Make sure the Rayfin Functions service is deployed (rayfin up).',
      };
    }
  }

  async extractSemanticSchema(id: string): Promise<{ ok: boolean; tablesFound: number }> {
    const client = getRayfinClient();
    const company = await this.get(id);
    if (!company) return { ok: false, tablesFound: 0 };
    if (!company.fabricSemanticModelId || !company.xmlaEndpoint) {
      return { ok: false, tablesFound: 0 };
    }
    // Invoke the server-side Rayfin function that connects to the XMLA
    // endpoint and extracts all tables/columns/measures from the
    // configured Semantic Model.
    try {
      const result = await client.functions.extractSemanticSchema.invoke({ companyId: id });
      return { ok: result.ok, tablesFound: result.tablesFound };
    } catch (err) {
      console.error('extractSemanticSchema invocation failed:', err);
      return { ok: false, tablesFound: 0 };
    }
  }
}
