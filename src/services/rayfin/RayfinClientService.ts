import { RayfinClient } from '@microsoft/rayfin-client';

import type { AidipSchema } from '../../../rayfin/data/schema';
import type { AppFunctionsSchema } from '../../../rayfin/functions/src/types';

/**
 * A singleton service that manages the RayfinClient instance.
 *
 * The client is typed against:
 *   - `AidipSchema` — the 14 AIDIP data entities (Company, User, …)
 *   - `AppFunctionsSchema` — the 8 server-side functions (chat, exportReport, …)
 *
 * This gives type-safe access to:
 *   - `client.data.<Entity>.select(...).where(...).execute()`
 *   - `client.functions.<name>.invoke(args)` — fully type-checked
 */
export class RayfinClientService {
  private static instance: RayfinClientService | null = null;
  private _client: RayfinClient<AidipSchema, AppFunctionsSchema> | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of RayfinClientService.
   */
  public static getInstance(): RayfinClientService {
    if (!RayfinClientService.instance) {
      RayfinClientService.instance = new RayfinClientService();
    }
    return RayfinClientService.instance;
  }

  /**
   * Initialize the RayfinClient with the provided base URL and publishable key.
   *
   * The functions base URL is read from `VITE_RAYFIN_FUNCTIONS_URL`. When
   * unset, function invocations throw at call time — set it via
   * `rayfin env --framework vite` (which generates it from the manifest
   * tokens after `rayfin up` provisions the Functions service).
   *
   * @param baseUrl The base URL of the Rayfin API (DAB / auth).
   * @param publishableKey The publishable key for service-level authentication.
   * @returns The initialized RayfinClient instance.
   */
  public initialize(
    baseUrl: string,
    publishableKey: string,
  ): RayfinClient<AidipSchema, AppFunctionsSchema> {
    if (!this._client) {
      console.log(`🔧 Initializing Rayfin client with baseUrl: ${baseUrl}`);

      const functionsBaseUrl = import.meta.env.VITE_RAYFIN_FUNCTIONS_URL;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
      };

      this._client = new RayfinClient<AidipSchema, AppFunctionsSchema>({
        baseUrl: baseUrl,
        publishableKey: publishableKey,
        useProxy: false,
        headers,
        ...(functionsBaseUrl ? { functionsBaseUrl } : {}),
      });

      console.log(
        `✅ Rayfin client configured for direct API calls to ${baseUrl}` +
          (functionsBaseUrl ? ` (functions: ${functionsBaseUrl})` : ' (functions: not configured)'),
      );
    }

    return this._client;
  }

  /**
   * Get the RayfinClient instance
   * @throws Error if the client is not initialized
   */
  public getClient(): RayfinClient<AidipSchema, AppFunctionsSchema> {
    if (!this._client) {
      throw new Error('RayfinClient not initialized. Call initialize() first.');
    }
    return this._client;
  }

  /**
   * Check if the client is initialized
   */
  public isInitialized(): boolean {
    return this._client !== null;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    RayfinClientService.instance = null;
  }
}

/**
 * Helper function to get the RayfinClient instance
 * @throws Error if the client is not initialized
 */
export function getRayfinClient(): RayfinClient<AidipSchema, AppFunctionsSchema> {
  return RayfinClientService.getInstance().getClient();
}
