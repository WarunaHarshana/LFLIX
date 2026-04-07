import { NextResponse } from 'next/server';
import autoDownloader from '@/lib/autoDownloader';
import releaseMonitor from '@/lib/releaseMonitor';

export const dynamic = 'force-dynamic';

// GET — auto-download queue status
export async function GET() {
  try {
    const status = autoDownloader.getStatus();
    return NextResponse.json(status);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — manually trigger a check for missing episodes
export async function POST() {
  try {
    // First, check for new releases from TMDB
    const newEpisodes = await releaseMonitor.checkAllTrackedShows();

    // Then process any new episodes for download
    if (newEpisodes.length > 0) {
      // Run in background so we respond quickly
      autoDownloader.processNewEpisodes(newEpisodes).catch(e =>
        console.error('[AutoDownload] Manual trigger processing error:', e)
      );
    }

    // Also retry any pending episodes
    autoDownloader.retryPendingEpisodes().catch(e =>
      console.error('[AutoDownload] Retry error:', e)
    );

    const status = autoDownloader.getStatus();
    return NextResponse.json({
      success: true,
      newEpisodesFound: newEpisodes.length,
      status,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
