import { entity, role, text, uuid, date, set, int } from '@microsoft/rayfin-core';

export type CompanyPlan = 'free' | 'pro' | 'enterprise' | 'custom';
export type CompanyStatus = 'active' | 'suspended' | 'deleted';
export type AuthType = 'service_principal' | 'delegated';
export type AIProvider = 'azure_openai' | 'openai';

/**
 * Company (tenant) — top-level entity. Each AIDIP client has its own
 * Company row. The HESYD control-plane company is identified by a
 * NULL domain / plan = 'custom' / notes_internal containing 'HESYD'.
 *
 * RLS:
 *   - super_admin: full access (cross-tenant)
 *   - admin: read/update own company (excluding encrypted secrets)
 *   - analyst: read own company's display fields only
 */
@entity()
@role('authenticated', '*')
export class Company {
  @uuid() id!: string;
  @text() name!: string;
  @text() slug!: string;
  @text({ optional: true }) domain?: string;

  @set('free', 'pro', 'enterprise', 'custom') plan!: CompanyPlan;
  @set('active', 'suspended', 'deleted') status!: CompanyStatus;

  @int() maxUsers!: number;
  @int() maxQueriesPerDay!: number;
  @int() storageGb!: number;
  @int() queriesToday!: number;

  @date({ optional: true }) subscriptionStart?: Date;
  @date({ optional: true }) subscriptionEnd?: Date;

  // Fabric config (super-admin editable only)
  @text({ optional: true }) fabricWorkspaceId?: string;
  @text({ optional: true }) fabricSemanticModelId?: string;
  @text({ optional: true }) azureTenantId?: string;
  @text({ optional: true }) servicePrincipalClientId?: string;
  @text({ optional: true }) servicePrincipalClientSecretEnc?: string;
  @text({ optional: true }) xmlaEndpoint?: string;
  @set('service_principal', 'delegated') authType!: AuthType;

  // AI config (super-admin editable only)
  @set('azure_openai', 'openai') aiProvider!: AIProvider;
  @text({ optional: true }) azureOpenaiEndpoint?: string;
  @text({ optional: true }) azureOpenaiApiKeyEnc?: string;
  @text() modelChatFast!: string;
  @text() modelChatComplex!: string;
  @text() modelReport!: string;
  @int() maxTokensPerRequest!: number;
  @int() aiDailyTokenBudget!: number;

  // Display settings
  @text() defaultTimezone!: string;
  @text() defaultCurrency!: string;
  @text({ optional: true }) logoUrl?: string;
  @text({ optional: true }) notesInternal?: string;

  @date({ optional: true }) deletedAt?: Date;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
