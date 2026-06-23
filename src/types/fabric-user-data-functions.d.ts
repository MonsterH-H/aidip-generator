/**
 * Ambient type declaration for `@microsoft/fabric-user-data-functions`.
 *
 * This package is installed by `rayfin functions init` in the
 * `rayfin/functions/` subproject. Until it's installed, this shim
 * lets the front-end type-check pass so that `import type { AppFunctionsSchema }`
 * from `rayfin/functions/src/types.ts` resolves.
 *
 * After running `npm run functions:init` (or `npm install` inside
 * `rayfin/functions/`), the real package types take precedence and
 * this file becomes a no-op.
 */

declare module '@microsoft/fabric-user-data-functions' {
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
