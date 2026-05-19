import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/apiSecurity';
import db from '@/lib/db';
import { getSafeErrorMessage } from '@/lib/security';
import { getSourceHealthSnapshot } from '@/lib/sourceHealth';

export const dynamic = 'force-dynamic';

const TORRENT_SOURCES = ['PSA', 'TPB', 'YTS', 'Knaben', 'Nyaa', 'DDL'];

type CountRow = { count: number };
type DownloadStatusRow = { status: string; count: number };

function getTableCount(tableName: string): number {
  return (db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as CountRow).count;
}

function getConditionalCount(sql: string): number {
  return (db.prepare(sql).get() as CountRow).count;
}

function getDownloadStatusCounts(): Record<string, number> {
  const rows = db.prepare(`
    SELECT COALESCE(status, 'unknown') as status, COUNT(*) as count
    FROM downloads
    GROUP BY COALESCE(status, 'unknown')
  `).all() as DownloadStatusRow[];

  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export async function GET(req: Request) {
  const checkedAt = new Date().toISOString();

  try {
    const limited = rateLimit(req, 'health-read', { windowMs: 60 * 1000, max: 60 });
    if (limited) return limited;

    db.prepare('SELECT 1 as ok').get();

    const journalMode = String(db.pragma('journal_mode', { simple: true }) || 'unknown');
    const downloadsByStatus = getDownloadStatusCounts();
    const activeDownloads = ['metadata', 'downloading', 'stalled']
      .reduce((total, status) => total + (downloadsByStatus[status] || 0), 0);
    const torrentSources = getSourceHealthSnapshot(TORRENT_SOURCES);
    const unhealthySources = torrentSources.filter((source) => source.state === 'degraded' || source.state === 'down');

    return NextResponse.json({
      status: unhealthySources.length > 0 ? 'degraded' : 'ok',
      checkedAt,
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        ok: true,
        journalMode,
        counts: {
          movies: getTableCount('movies'),
          shows: getTableCount('shows'),
          episodes: getTableCount('episodes'),
          watchlist: getTableCount('watchlist'),
          autoTrack: getTableCount('auto_track'),
          notificationsUnread: getConditionalCount('SELECT COUNT(*) as count FROM notifications WHERE read = 0'),
        },
      },
      downloads: {
        active: activeDownloads,
        byStatus: downloadsByStatus,
      },
      releaseTracking: {
        pendingEpisodes: getConditionalCount('SELECT COUNT(*) as count FROM episode_releases WHERE downloadAttempted = 0'),
        attemptedEpisodes: getConditionalCount('SELECT COUNT(*) as count FROM episode_releases WHERE downloadAttempted = 1'),
        pendingMovies: getConditionalCount('SELECT COUNT(*) as count FROM movie_releases WHERE isAvailable = 0'),
        availableMovies: getConditionalCount('SELECT COUNT(*) as count FROM movie_releases WHERE isAvailable = 1'),
      },
      torrentSources,
    });
  } catch (error) {
    console.error('[Health] diagnostics failed:', error);
    return NextResponse.json(
      {
        status: 'down',
        checkedAt,
        database: { ok: false },
        error: getSafeErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
