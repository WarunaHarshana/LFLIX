import crypto from 'crypto';
import db from './db';

/**
 * Short-lived tokens that let a device stream a specific library item without
 * sending the PIN cookie — used by DLNA renderers, Smart TV browsers and the
 * Capacitor app, none of which carry cookies reliably.
 *
 * Backed by SQLite rather than a module-level Map: a dev-server reload or a
 * service restart used to invalidate every outstanding token mid-playback.
 * Tokens are stored as SHA-256 digests so the database never holds a value that
 * is itself usable.
 */

export type StreamTokenPayload = {
  contentType: 'movie' | 'show';
  contentId: number;
  episodeId?: number;
};

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Drop expired rows. Cheap, indexed, and keeps the table from growing. */
export function purgeExpiredStreamTokens(): number {
  try {
    return db.prepare('DELETE FROM stream_tokens WHERE expiresAt <= ?').run(Date.now()).changes;
  } catch {
    return 0;
  }
}

export function createStreamToken(payload: StreamTokenPayload, ttlMs = TOKEN_TTL_MS): string {
  const token = crypto.randomBytes(32).toString('hex');

  purgeExpiredStreamTokens();

  db.prepare(`
    INSERT INTO stream_tokens (tokenHash, contentType, contentId, episodeId, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    hashToken(token),
    payload.contentType,
    payload.contentId,
    payload.episodeId ?? null,
    Date.now() + ttlMs
  );

  return token;
}

export function verifyStreamToken(token: string): StreamTokenPayload | null {
  if (typeof token !== 'string' || token.length === 0) return null;

  try {
    const row = db
      .prepare(`
        SELECT contentType, contentId, episodeId, expiresAt
        FROM stream_tokens
        WHERE tokenHash = ?
        LIMIT 1
      `)
      .get(hashToken(token)) as
      | { contentType: string; contentId: number; episodeId: number | null; expiresAt: number }
      | undefined;

    if (!row) return null;

    if (row.expiresAt <= Date.now()) {
      db.prepare('DELETE FROM stream_tokens WHERE tokenHash = ?').run(hashToken(token));
      return null;
    }

    if (row.contentType !== 'movie' && row.contentType !== 'show') return null;

    return {
      contentType: row.contentType,
      contentId: row.contentId,
      episodeId: row.episodeId ?? undefined,
    };
  } catch {
    return null;
  }
}
