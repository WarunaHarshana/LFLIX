import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    OPTIMIZED_MPV_CONF,
    getMpvConfigPath,
    isMpvConfigOptimized,
    deployMpvConfig,
    findInstalledPlayers,
    getBestDefaultPlayerPath,
} from '@/lib/playerConfig';
import { getOptimizedMountArgs } from '@/lib/gdriveUploader';

describe('Player Configuration and Cloud Streaming Optimizations', () => {
    describe('OPTIMIZED_MPV_CONF', () => {
        it('contains key cloud streaming optimizations from session 1e0289c5-f68a-4b49-8c0d-ac463d3a86d4', () => {
            // Instant open
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-mkv-probe-start-time=no');
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-mkv-subtitle-preroll=no');
            // Instant close
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-termination-timeout=0.1');
            // Fast seek & buffer
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-readahead-secs=30');
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-max-bytes=300MiB');
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-max-back-bytes=100MiB');
            expect(OPTIMIZED_MPV_CONF).toContain('demuxer-seekable-cache=yes');
            // GPU video output & tone mapping
            expect(OPTIMIZED_MPV_CONF).toContain('vo=gpu-next');
            expect(OPTIMIZED_MPV_CONF).toContain('gpu-api=d3d11');
            expect(OPTIMIZED_MPV_CONF).toContain('tone-mapping=spline');
            expect(OPTIMIZED_MPV_CONF).toContain('[4k-hevc]');
        });
    });

    describe('getMpvConfigPath', () => {
        it('returns a valid string path ending in mpv.conf', () => {
            const configPath = getMpvConfigPath();
            expect(typeof configPath).toBe('string');
            expect(configPath.toLowerCase().endsWith('mpv.conf')).toBe(true);
        });
    });

    describe('isMpvConfigOptimized & deployMpvConfig', () => {
        it('detects optimized config when key flags are present', () => {
            // Since deployMpvConfig writes to the user directory, test deploy return
            const res = deployMpvConfig();
            expect(res.success).toBe(true);
            expect(fs.existsSync(res.path)).toBe(true);
            expect(isMpvConfigOptimized()).toBe(true);
        });
    });

    describe('findInstalledPlayers & getBestDefaultPlayerPath', () => {
        it('returns detected players array with MPV flagged as recommended', () => {
            const players = findInstalledPlayers();
            expect(Array.isArray(players)).toBe(true);
            const mpv = players.find(p => p.type === 'mpv');
            if (mpv) {
                expect(mpv.recommended).toBe(true);
            }
        });

        it('prefers MPV path when MPV is installed on the machine', () => {
            const best = getBestDefaultPlayerPath();
            expect(typeof best).toBe('string');
            if (findInstalledPlayers().some(p => p.type === 'mpv')) {
                expect(best.toLowerCase()).toContain('mpv');
            }
        });
    });

    describe('getOptimizedMountArgs', () => {
        it('builds rclone mount arguments with instant-open and instant-close streaming flags', () => {
            const args = getOptimizedMountArgs('gdrive', 'Z:', 'C:\\TempDir');

            expect(args).toContain('mount');
            expect(args).toContain('gdrive:');
            expect(args).toContain('Z:');
            // Instant open (2MB)
            expect(args).toContain('--vfs-read-chunk-size');
            expect(args[args.indexOf('--vfs-read-chunk-size') + 1]).toBe('2M');
            // Ramp up limit (64MB)
            expect(args).toContain('--vfs-read-chunk-size-limit');
            expect(args[args.indexOf('--vfs-read-chunk-size-limit') + 1]).toBe('64M');
            // Instant close (0s handle caching)
            expect(args).toContain('--vfs-handle-caching');
            expect(args[args.indexOf('--vfs-handle-caching') + 1]).toBe('0s');
            // Zero seek wait & 16M buffer
            expect(args).toContain('--vfs-read-wait');
            expect(args[args.indexOf('--vfs-read-wait') + 1]).toBe('0ms');
            expect(args).toContain('--buffer-size');
            expect(args[args.indexOf('--buffer-size') + 1]).toBe('16M');
            // Caching mode
            expect(args).toContain('--vfs-cache-mode');
            expect(args[args.indexOf('--vfs-cache-mode') + 1]).toBe('full');
            // Cache directory
            expect(args).toContain('--cache-dir');
            expect(args[args.indexOf('--cache-dir') + 1]).toBe(path.join('C:\\TempDir', 'rclone-cache'));
        });
    });
});
