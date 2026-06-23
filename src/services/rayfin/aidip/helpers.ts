/**
 * Rayfin AIDIP services — shared helpers.
 *
 * Helpers for serializing JSON fields, parsing Rayfin row responses (which
 * expose foreign keys as `<field>_id` rather than typed relation objects),
 * and enforcing session-scoped access.
 */

import { getRayfinClient } from '../RayfinClientService';

/** Returns the current Rayfin auth session's user id (or throws). */
export function getCurrentUserId(): string {
  const client = getRayfinClient();
  const session = client.auth.getSession();
  if (!session.isAuthenticated || !session.user) {
    throw new Error('Not authenticated.');
  }
  return session.user.id;
}

/** Returns the current Rayfin auth session's user email (or throws). */
export function getCurrentUserEmail(): string {
  const client = getRayfinClient();
  const session = client.auth.getSession();
  if (!session.isAuthenticated || !session.user) {
    throw new Error('Not authenticated.');
  }
  return session.user.email;
}

/** Safely parse JSON, returning null on failure. */
export function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Safely stringify JSON, returning 'null' on failure. */
export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

/**
 * Extracts a foreign-key id from a Rayfin row, preferring the typed
 * relation object when present and falling back to the `<field>_id` flat
 * column that Rayfin returns alongside.
 *
 * Example: `relationId(row, 'company')` reads `row.company?.id ?? row.company_id`.
 */
export function relationId<T extends Record<string, unknown>>(
  row: T,
  field: string,
): string | null {
  const rel = row[field] as { id?: string } | undefined;
  if (rel && typeof rel === 'object' && rel.id) return rel.id;
  const flatKey = `${field}_id`;
  const flat = row[flatKey] as string | undefined;
  return flat ?? null;
}

/** Returns the current ISO timestamp string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Sleeps for the given milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
