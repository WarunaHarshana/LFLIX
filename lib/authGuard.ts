import crypto from 'crypto';
import { NextResponse } from 'next/server';
import db from './db';

/**
 * Auth helpers for the two routes that must stay reachable *before* the app has
 * been configured: `/api/browse` (the setup wizard's folder picker) and
 * `POST /api/setup` (which writes the PIN).
 *
 * These cannot live in `middleware.ts` — middleware runs on the edge runtime and
 * cannot import `better-sqlite3` — so the routes call `guardSetupRoute` directly
 * and are excluded from the middleware `publicPaths` list.
 */

export function isSetupComplete(): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'setupComplete'")
      .get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch {
    // If settings are unreadable we cannot prove setup finished. Fail closed:
    // treating it as complete keeps these routes locked rather than open.
    return true;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  // Length is not the secret here; the value is.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hasValidPin(req: Request): boolean {
  // Must match middleware.ts exactly, including the legacy '1234' fallback —
  // if the two disagree, a genuinely logged-in user gets rejected here.
  // Removing that default is tracked separately as PIN hardening.
  const expected = process.env.APP_PIN || '1234';

  const provided = readCookie(req, 'app-pin');
  if (!provided) return false;

  return safeEquals(provided, expected);
}

/**
 * Allow the request when setup has not finished yet (the wizard needs it), or
 * when the caller is already authenticated. Returns a 401 response otherwise.
 */
export function guardSetupRoute(req: Request): NextResponse | null {
  if (!isSetupComplete()) return null;
  if (hasValidPin(req)) return null;

  return NextResponse.json(
    { error: 'Unauthorized. Please provide valid PIN.' },
    { status: 401 }
  );
}
