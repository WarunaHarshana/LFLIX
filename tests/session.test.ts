import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  createSessionValue,
  getConfiguredPin,
  verifyPin,
  verifySessionValue,
} from '@/lib/session';

const PIN = '4321';

beforeEach(() => {
  process.env.APP_PIN = PIN;
});

describe('getConfiguredPin', () => {
  it('reads APP_PIN', () => {
    expect(getConfiguredPin()).toBe(PIN);
  });

  it('has no fallback default', () => {
    // The old code fell back to '1234', which meant an install that never set
    // APP_PIN was protected by a publicly documented PIN.
    delete process.env.APP_PIN;
    expect(getConfiguredPin()).toBeNull();
    process.env.APP_PIN = '   ';
    expect(getConfiguredPin()).toBeNull();
  });
});

describe('verifyPin', () => {
  it('accepts the configured PIN', () => {
    expect(verifyPin(PIN)).toBe(true);
  });

  it('rejects wrong values, including prefixes and suffixes', () => {
    for (const bad of ['0000', '432', '43210', '', ' 4321']) {
      expect(verifyPin(bad), bad).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    for (const bad of [undefined, null, 4321, {}, []]) {
      expect(verifyPin(bad)).toBe(false);
    }
  });

  it('rejects everything when no PIN is configured', () => {
    delete process.env.APP_PIN;
    expect(verifyPin('1234')).toBe(false);
    expect(verifyPin('')).toBe(false);
  });
});

describe('session values', () => {
  it('round-trips a freshly minted session', async () => {
    const value = await createSessionValue();
    expect(value).toBeTruthy();
    expect(await verifySessionValue(value)).toBe(true);
  });

  it('never contains the PIN', async () => {
    const value = await createSessionValue();
    expect(value).not.toContain(PIN);
  });

  it('rejects a tampered signature', async () => {
    const value = (await createSessionValue())!;
    const [payload, signature] = value.split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(await verifySessionValue(`${payload}.${flipped}`)).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const value = (await createSessionValue())!;
    const signature = value.slice(value.lastIndexOf('.') + 1);
    const forged = btoa(JSON.stringify({ iat: Date.now(), exp: Date.now() + 1e9 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifySessionValue(`${forged}.${signature}`)).toBe(false);
  });

  it('rejects an expired session', async () => {
    const value = await createSessionValue(-1000);
    expect(await verifySessionValue(value)).toBe(false);
  });

  it('rejects malformed input', async () => {
    for (const bad of ['', 'no-dot', '.', 'a.b', null, undefined]) {
      expect(await verifySessionValue(bad as string), String(bad)).toBe(false);
    }
  });

  it('stops accepting sessions once the PIN changes', async () => {
    // The signing key is derived from APP_PIN, so rotating the PIN should
    // invalidate every outstanding session without any server-side state.
    const value = await createSessionValue();
    expect(await verifySessionValue(value)).toBe(true);

    process.env.APP_PIN = '9999';
    expect(await verifySessionValue(value)).toBe(false);
  });

  it('cannot mint or verify without a configured PIN', async () => {
    delete process.env.APP_PIN;
    expect(await createSessionValue()).toBeNull();
    expect(await verifySessionValue('anything.atall')).toBe(false);
  });

  it('exposes a cookie name distinct from the old PIN cookie', () => {
    expect(SESSION_COOKIE).not.toBe('app-pin');
  });
});
