/**
 * Ambient type declaration for `@microsoft/fabric-user-data-functions`.
 *
 * This package is installed by `rayfin functions init` in the
 * `rayfin/functions/` subproject. Until it's installed in the local
 * node_modules, this shim lets the functions subproject type-check
 * against the API surface used by `function_app.ts`.
 *
 * After running `npm run functions:init` (or `npm install` inside
 * `rayfin/functions/`), the real package types take precedence and
 * this file becomes a no-op.
 *
 * NOTE — extensions beyond the minimal shim:
 *   - `RayfinContext.executeDax()`           — DAX query execution against the Semantic Model (used by chat pipeline + KPI computation).
 *   - `RayfinContext.getStorageClient()`     — Fabric blob storage access (used by the export worker).
 *   - `RayfinContext.getRequestClaims()`     — Inspect the current request's JWT claims (used by impersonation state).
 *
 * These methods mirror the Fabric UDF runtime API. If the real package
 * exposes a different surface, the corresponding call sites in
 * `function_app.ts` must be updated.
 */

declare module '@microsoft/fabric-user-data-functions' {
  /** Result shape returned by `ctx.executeDax()`. */
  export interface DaxQueryResult {
    /** Column names in the order they appear in the result set. */
    columns: string[];
    /** Row data, keyed by column name. */
    rows: Record<string, unknown>[];
    /** Number of rows returned. */
    rowCount: number;
    /** Server-reported execution time in milliseconds. */
    executionTimeMs: number;
  }

  /** Options accepted by `ctx.executeDax()`. */
  export interface ExecuteDaxOptions {
    /** Query timeout in milliseconds (default 30000). */
    timeoutMs?: number;
    /**
     * Optional Semantic Model ID. When omitted, the runtime uses the
     * Semantic Model configured on the current company.
     */
    semanticModelId?: string;
  }

  /** Storage client returned by `ctx.getStorageClient()`. */
  export interface RayfinStorageClient {
    upload(
      container: string,
      blob: string,
      data: Buffer | Uint8Array,
      options?: { contentType?: string; metadata?: Record<string, string> },
    ): Promise<{ url: string; blobUrl: string; etag?: string }>;
    download(container: string, blob: string): Promise<Buffer>;
    delete(container: string, blob: string): Promise<void>;
    /** Returns a SAS URL valid until `expiresOn`. */
    getSignedUrl(container: string, blob: string, expiresOn: Date): Promise<string>;
    /** Returns true if the container exists. */
    exists(container: string, blob?: string): Promise<boolean>;
  }

  /** JWT claims exposed by `ctx.getRequestClaims()`. */
  export interface RayfinRequestClaims {
    sub: string;
    email?: string;
    name?: string;
    role?: string;
    companyId?: string;
    [claim: string]: unknown;
  }

  export interface RayfinContext<TSchema = Record<string, unknown>> {
    /** Returns a typed entity data client (same chain as `client.data`). */
    getDataClient(): {
      [K in keyof TSchema]: {
        findById(id: string): Promise<TSchema[K] | null>;
        findMany(filter?: unknown): Promise<TSchema[K][]>;
        create(input: unknown): Promise<TSchema[K]>;
        update(where: { id: string }, data: unknown): Promise<TSchema[K]>;
        delete(where: { id: string }): Promise<TSchema[K]>;
      };
    };

    /**
     * Execute a DAX query against the company's configured Semantic Model
     * via DAB + XMLA. RLS is applied automatically based on the caller's
     * access token.
     */
    executeDax(query: string, options?: ExecuteDaxOptions): Promise<DaxQueryResult>;

    /**
     * Returns a storage client for Fabric blob storage. Returns null if
     * storage is not configured for the current company.
     */
    getStorageClient(): RayfinStorageClient | null;

    /**
     * Returns the parsed JWT claims for the current request. Used by
     * impersonation state inspection.
     */
    getRequestClaims(): RayfinRequestClaims | null;

    /** Structured logger. */
    log: {
      info(message: string, ...args: unknown[]): void;
      warn(message: string, ...args: unknown[]): void;
      error(message: string, ...args: unknown[]): void;
    };
    /** Rayfin endpoint URL (readonly). */
    readonly baseUrl: string;
    /** Auth token for the current request (readonly). */
    readonly accessToken: string | null;
    /** Rayfin publishable key (readonly). */
    readonly publishableKey: string;
  }

  export class UserDataFunctions {
    func<TInput, TOutput>(
      name: string,
      handler: (input: TInput, ctx: RayfinContext) => Promise<TOutput> | TOutput,
      middleware: unknown[],
    ): void;
    func<TOutput>(
      name: string,
      handler: (ctx: RayfinContext) => Promise<TOutput> | TOutput,
      middleware: unknown[],
    ): void;
  }
}
