import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { guardSetupRoute, hasValidPin, isSetupComplete } = await import('@/lib/authGuard');

const PIN = '4321';

function request(cookie?: string): Request {
  return new Request('http://localhost:3000/api/browse', {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  process.env.APP_PIN = PIN;
  settingsValue.current = 'true';
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe('hasValidPin', () => {
  it('accepts the correct PIN cookie', () => {
    expect(hasValidPin(request(`app-pin=${PIN}`))).toBe(true);
  });

  it('rejects a wrong PIN', () => {
    expect(hasValidPin(request('app-pin=0000'))).toBe(false);
  });

  it('rejects a missing cookie header and an unrelated cookie', () => {
    expect(hasValidPin(request())).toBe(false);
    expect(hasValidPin(request('theme=dark'))).toBe(false);
  });

  it('rejects a PIN that is only a prefix or suffix of the real one', () => {
    expect(hasValidPin(request('app-pin=432'))).toBe(false);
    expect(hasValidPin(request(`app-pin=${PIN}0`))).toBe(false);
  });

  it('finds the cookie among several, in any position', () => {
    expect(hasValidPin(request(`theme=dark; app-pin=${PIN}; other=1`))).toBe(true);
    expect(hasValidPin(request(`app-pin=${PIN}; theme=dark`))).toBe(true);
  });

  it('does not confuse a similarly named cookie for the real one', () => {
    expect(hasValidPin(request(`xapp-pin=${PIN}`))).toBe(false);
    expect(hasValidPin(request(`app-pin-old=${PIN}`))).toBe(false);
  });

  it('falls back to the legacy default when APP_PIN is unset, matching middleware', () => {
    delete process.env.APP_PIN;
    expect(hasValidPin(request('app-pin=1234'))).toBe(true);
    expect(hasValidPin(request('app-pin=9999'))).toBe(false);
  });
});

describe('guardSetupRoute', () => {
  it('allows anyone through while setup is incomplete', () => {
    settingsValue.current = undefined;
    expect(guardSetupRoute(request())).toBeNull();
  });

  it('allows an authenticated caller once setup is complete', () => {
    expect(guardSetupRoute(request(`app-pin=${PIN}`))).toBeNull();
  });

  it('rejects an unauthenticated caller once setup is complete', () => {
    const denied = guardSetupRoute(request());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it('rejects a wrong PIN once setup is complete', () => {
    expect(guardSetupRoute(request('app-pin=0000'))?.status).toBe(401);
  });
});
