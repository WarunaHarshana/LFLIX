/**
 * Signed session cookies.
 *
 * The auth cookie used to contain the PIN itself, compared with `!==` on every
 * request. It now carries an opaque, HMAC-signed payload instead, so the secret
 * never travels to the client and a stolen cookie cannot be read back into a PIN.
 *
 * Uses Web Crypto only — no Node built-ins — because `middleware.ts` validates
 * these on the edge runtime, where `node:crypto` and `better-sqlite3` are both
 * unavailable. That is also why the session is stateless: middleware cannot
 * reach a database to look one up.
 *
 * The signing key is derived from APP_PIN, so changing the PIN invalidates every
 * outstanding session for free.
 */

export const SESSION_COOKIE = 'lflix-session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  /** issued-at, epoch ms */
  iat: number;
  /** expires-at, epoch ms */
  exp: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Compare two strings without leaking their contents through timing. */
function timingSafeEqualString(a: string, b: string): boolean {
  // Length is not the secret; the value is. Comparing unequal-length inputs
  // still walks the full loop so the early exit reveals nothing extra.
  let mismatch = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * The PIN that gates this install. Returns null when unset — there is
 * deliberately no fallback default any more.
 */
export function getConfiguredPin(): string | null {
  const pin = process.env.APP_PIN?.trim();
  return pin ? pin : null;
}

export function verifyPin(candidate: unknown): boolean {
  const expected = getConfiguredPin();
  if (!expected) return false;
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  return timingSafeEqualString(candidate, expected);
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const pin = getConfiguredPin();
  if (!pin) return null;

  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`lflix-session-v1:${pin}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(data: string, key: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Mint a `<payload>.<signature>` cookie value. Returns null if unconfigured. */
export async function createSessionValue(ttlMs = SESSION_TTL_MS): Promise<string | null> {
  const key = await getSigningKey();
  if (!key) return null;

  const now = Date.now();
  const payload: SessionPayload = { iat: now, exp: now + ttlMs };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

  return `${encoded}.${await sign(encoded, key)}`;
}

/** Validate signature and expiry. Any malformed input is simply invalid. */
export async function verifySessionValue(value: string | null | undefined): Promise<boolean> {
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return false;

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const key = await getSigningKey();
  if (!key) return false;

  let expected: string;
  try {
    expected = await sign(encoded, key);
  } catch {
    return false;
  }

  if (!timingSafeEqualString(signature, expected)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as SessionPayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Cookie attributes shared by the login and logout routes. */
export function sessionCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    secure: isHttps,
    // 'lax' rather than 'strict' so the app still works when reached by IP
    // from a phone or TV on the LAN.
    sameSite: 'lax' as const,
    path: '/',
  };
}
