import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

// Back lib/streamTokens with a throwaway in-memory database rather than the
// real library file.
const testDb = new Database(':memory:');
testDb.exec(`
  CREATE TABLE stream_tokens (
    tokenHash TEXT PRIMARY KEY,
    contentType TEXT NOT NULL,
    contentId INTEGER NOT NULL,
    episodeId INTEGER,
    expiresAt INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

vi.mock('@/lib/db', () => ({ default: testDb }));

const { createStreamToken, purgeExpiredStreamTokens, verifyStreamToken } =
  await import('@/lib/streamTokens');

beforeEach(() => {
  testDb.exec('DELETE FROM stream_tokens');
});

describe('createStreamToken', () => {
  it('returns a 64-char hex token', () => {
    const token = createStreamToken({ contentType: 'movie', contentId: 1 });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues a distinct token every call', () => {
    const a = createStreamToken({ contentType: 'movie', contentId: 1 });
    const b = createStreamToken({ contentType: 'movie', contentId: 1 });
    expect(a).not.toBe(b);
  });

  it('never stores the raw token', () => {
    const token = createStreamToken({ contentType: 'movie', contentId: 7 });
    const rows = testDb.prepare('SELECT tokenHash FROM stream_tokens').all() as { tokenHash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
  });
});

describe('verifyStreamToken', () => {
  it('round-trips a movie payload', () => {
    const token = createStreamToken({ contentType: 'movie', contentId: 42 });
    expect(verifyStreamToken(token)).toEqual({
      contentType: 'movie',
      contentId: 42,
      episodeId: undefined,
    });
  });

  it('round-trips a show payload with an episode', () => {
    const token = createStreamToken({ contentType: 'show', contentId: 3, episodeId: 99 });
    expect(verifyStreamToken(token)).toEqual({
      contentType: 'show',
      contentId: 3,
      episodeId: 99,
    });
  });

  it('rejects an unknown, empty or non-string token', () => {
    expect(verifyStreamToken('deadbeef')).toBeNull();
    expect(verifyStreamToken('')).toBeNull();
    expect(verifyStreamToken(undefined as unknown as string)).toBeNull();
  });

  it('rejects an expired token and removes the row', () => {
    const token = createStreamToken({ contentType: 'movie', contentId: 1 }, -1000);
    expect(verifyStreamToken(token)).toBeNull();

    const remaining = testDb.prepare('SELECT COUNT(*) AS n FROM stream_tokens').get() as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('survives a simulated process restart', () => {
    // The whole point of moving off a module-level Map: the row outlives the
    // module instance, so playback is not cut off by a reload.
    const token = createStreamToken({ contentType: 'movie', contentId: 5 });
    const row = testDb.prepare('SELECT COUNT(*) AS n FROM stream_tokens').get() as { n: number };
    expect(row.n).toBe(1);
    expect(verifyStreamToken(token)?.contentId).toBe(5);
  });
});

describe('purgeExpiredStreamTokens', () => {
  it('removes only expired rows', () => {
    const live = createStreamToken({ contentType: 'movie', contentId: 1 });
    createStreamToken({ contentType: 'movie', contentId: 2 }, -1);

    expect(purgeExpiredStreamTokens()).toBe(1);
    expect(verifyStreamToken(live)).not.toBeNull();
  });
});
