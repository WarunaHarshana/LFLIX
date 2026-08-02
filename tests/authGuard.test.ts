import { beforeEach, describe, expect, it, vi } from 'vitest';

// lib/authGuard imports lib/db, which would open the real library database on
// import. Stub it so these tests stay hermetic and can drive setupComplete.
const settingsValue = { current: 'true' as string | undefined };

vi.mock('@/lib/db', () => ({
  default: {
    prepare: () => ({
      get: () => (settingsValue.current === undefined ? undefined : { value: settingsValue.current }),
    }),
  },
}));

const { guardSetupRoute, hasValidSession, isSetupComplete } = await import('@/lib/authGuard');
const { SESSION_COOKIE, createSessionValue } = await import('@/lib/session');

const PIN = '4321';

function request(cookie?: string): Request {
  return new Request('http://localhost:3000/api/browse', {
    headers: cookie ? { cookie } : {},
  });
}

async function sessionCookie(): Promise<string> {
  return `${SESSION_COOKIE}=${await createSessionValue()}`;
}

beforeEach(() => {
  process.env.APP_PIN = PIN;
  settingsValue.current = 'true';
});

describe('isSetupComplete', () => {
  it('is true when the flag is set', () => {
    settingsValue.current = 'true';
    expect(isSetupComplete()).toBe(true);
  });

  it('is false when the flag is absent or not "true"', () => {
    settingsValue.current = undefined;
    expect(isSetupComplete()).toBe(false);
    settingsValue.current = 'false';
    expect(isSetupComplete()).toBe(false);
  });
});

describe('hasValidSession', () => {
  it('accepts a valid session cookie', async () => {
    expect(await hasValidSession(request(await sessionCookie()))).toBe(true);
  });

  it('rejects a missing or unrelated cookie', async () => {
    expect(await hasValidSession(request())).toBe(false);
    expect(await hasValidSession(request('theme=dark'))).toBe(false);
  });

  it('rejects a forged value', async () => {
    expect(await hasValidSession(request(`${SESSION_COOKIE}=forged.signature`))).toBe(false);
  });

  it('rejects the legacy plaintext PIN cookie', async () => {
    // Pre-hardening clients sent the PIN itself; it must no longer authorise.
    expect(await hasValidSession(request(`app-pin=${PIN}`))).toBe(false);
    expect(await hasValidSession(request(`${SESSION_COOKIE}=${PIN}`))).toBe(false);
  });

  it('finds the cookie among several, in any position', async () => {
    const session = await sessionCookie();
    expect(await hasValidSession(request(`theme=dark; ${session}; other=1`))).toBe(true);
    expect(await hasValidSession(request(`${session}; theme=dark`))).toBe(true);
  });

  it('does not confuse a similarly named cookie for the real one', async () => {
    const value = await createSessionValue();
    expect(await hasValidSession(request(`x${SESSION_COOKIE}=${value}`))).toBe(false);
    expect(await hasValidSession(request(`${SESSION_COOKIE}-old=${value}`))).toBe(false);
  });
});

describe('guardSetupRoute', () => {
  it('allows anyone through while setup is incomplete', async () => {
    settingsValue.current = undefined;
    expect(await guardSetupRoute(request())).toBeNull();
  });

  it('allows an authenticated caller once setup is complete', async () => {
    expect(await guardSetupRoute(request(await sessionCookie()))).toBeNull();
  });

  it('rejects an unauthenticated caller once setup is complete', async () => {
    const denied = await guardSetupRoute(request());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it('rejects a forged session once setup is complete', async () => {
    const denied = await guardSetupRoute(request(`${SESSION_COOKIE}=nope.nope`));
    expect(denied?.status).toBe(401);
  });
});
