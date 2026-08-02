import { NextResponse } from 'next/server';
import db from './db';
import { SESSION_COOKIE, verifySessionValue } from './session';

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

/**
 * Whether the caller holds a valid session. Shares lib/session.ts with
 * middleware.ts so the two can never drift apart on what counts as authorised.
 */
export async function hasValidSession(req: Request): Promise<boolean> {
  return verifySessionValue(readCookie(req, SESSION_COOKIE));
}

/**
 * Allow the request when setup has not finished yet (the wizard needs it), or
 * when the caller is already authenticated. Returns a 401 response otherwise.
 */
export async function guardSetupRoute(req: Request): Promise<NextResponse | null> {
  if (!isSetupComplete()) return null;
  if (await hasValidSession(req)) return null;

  return NextResponse.json(
    { error: 'Unauthorized. Please sign in.' },
    { status: 401 }
  );
}
