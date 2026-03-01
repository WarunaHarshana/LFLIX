import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { probeFile } from '@/lib/mediainfo';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

/**
 * POST /api/reprobe
 * Re-probes all media files using FFprobe to fix incorrect resolution/codec/HDR data.
 * This is useful when FFprobe wasn't available during the initial scan.
 */
export async function POST() {
    try {
        const movies = db.prepare('SELECT id, filePath, fileName FROM movies').all() as { id: number; filePath: string; fileName: string }[];
        const episodes = db.prepare('SELECT id, filePath, fileName FROM episodes').all() as { id: number; filePath: string; fileName: string }[];

        let updated = 0;
        let failed = 0;

        // Re-probe movies
        for (const movie of movies) {
            try {
                const info = await probeFile(movie.filePath);
                if (info && info.resolution) {
                    db.prepare(`
                        UPDATE movies SET 
                            resolution = ?, videoCodec = ?, audioCodec = ?, audioChannels = ?, 
                            isHDR = ?, bitrate = ?, duration = ?, fileSize = ?
                        WHERE id = ?
                    `).run(
                        info.resolution, info.videoCodec, info.audioCodec, info.audioChannels,
                        info.isHDR ? 1 : 0, info.bitrate, info.duration, info.fileSize,
                        movie.id
                    );
                    updated++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        // Re-probe episodes
        for (const ep of episodes) {
            try {
                const info = await probeFile(ep.filePath);
                if (info && info.resolution) {
                    db.prepare(`
                        UPDATE episodes SET 
                            resolution = ?, videoCodec = ?, audioCodec = ?, audioChannels = ?, 
                            isHDR = ?, bitrate = ?, duration = ?, fileSize = ?
                        WHERE id = ?
                    `).run(
                        info.resolution, info.videoCodec, info.audioCodec, info.audioChannels,
                        info.isHDR ? 1 : 0, info.bitrate, info.duration, info.fileSize,
                        ep.id
                    );
                    updated++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            updated,
            failed,
            total: movies.length + episodes.length
        });
    } catch (e: any) {
        console.error('Reprobe error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
