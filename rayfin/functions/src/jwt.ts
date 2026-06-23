/**
 * JWT helpers for AIDIP impersonation (CDC §5).
 *
 * The impersonation token is a short-lived (30 minutes) JWT signed with
 * the same `Invitation__Secret` used for invitation tokens — HMAC-SHA256.
 *
 * Claims:
 *   - sub            — target user id (the user being impersonated)
 *   - impersonatedBy — super admin id (the user who initiated impersonation)
 *   - reason         — human-readable justification (min 10 chars)
 *   - iat            — issued-at (seconds since epoch)
 *   - exp            — expiry (iat + 30 min)
 *
 * The token is included in the response so the client can store it and
 * use it for subsequent requests. `getImpersonationState` inspects
 * `ctx.accessToken` to determine whether the current request is being
 * made under impersonation.
 */

import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

const IMPERSONATION_TTL_MINUTES = 30;
const IMPERSONATION_ALGORITHM = 'HS256';

export interface ImpersonationTokenPayload {
  sub: string;
  impersonatedBy: string;
  reason: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.Invitation__Secret;
  if (!secret || secret.length < 8) {
    throw new Error(
      'Invitation__Secret is not configured or too short (min 8 chars). Set it in local.settings.json.',
    );
  }
  return secret;
}

/** Mint a short-lived impersonation JWT for the target user. */
export function signImpersonationToken(
  targetUserId: string,
  superAdminId: string,
  reason: string,
): string {
  const secret = getSecret();
  const payload: Omit<ImpersonationTokenPayload, 'iat' | 'exp'> = {
    sub: targetUserId,
    impersonatedBy: superAdminId,
    reason,
  };
  const options: SignOptions = {
    algorithm: IMPERSONATION_ALGORITHM,
    expiresIn: IMPERSONATION_TTL_MINUTES * 60,
  };
  return jwt.sign(payload, secret, options);
}

/**
 * Verify the impersonation token's signature + expiry. Returns the
 * decoded payload or null if the token is invalid/expired.
 */
export function verifyImpersonationToken(
  token: string,
): ImpersonationTokenPayload | null {
  const secret = getSecret();
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [IMPERSONATION_ALGORITHM],
    });
    return normalisePayload(decoded);
  } catch {
    return null;
  }
}

/**
 * Decode the impersonation token WITHOUT signature verification.
 *
 * This is used by `getImpersonationState` to inspect an access token
 * that has already been verified by the Fabric runtime. We re-check
 * the `exp` claim manually to reject expired tokens.
 */
export function decodeImpersonationToken(
  token: string,
): ImpersonationTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.decode(token);
    return normalisePayload(decoded);
  } catch {
    return null;
  }
}

function normalisePayload(decoded: unknown): ImpersonationTokenPayload | null {
  if (!decoded || typeof decoded !== 'object') return null;
  const payload = decoded as JwtPayload;
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.impersonatedBy !== 'string'
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return null; // expired
  }
  return {
    sub: payload.sub,
    impersonatedBy: payload.impersonatedBy,
    reason: typeof payload.reason === 'string' ? payload.reason : '',
    iat: typeof payload.iat === 'number' ? payload.iat : 0,
    exp: typeof payload.exp === 'number' ? payload.exp : 0,
  };
}

/** Returns the impersonation TTL in minutes (used for audit logging). */
export function getImpersonationTtlMinutes(): number {
  return IMPERSONATION_TTL_MINUTES;
}
