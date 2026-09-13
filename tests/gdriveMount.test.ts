import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isMounted,
    refreshMountVfsCache,
    ensureDriveMounted,
    getOptimizedMountArgs,
} from '@/lib/gdriveUploader';

describe('Google Drive Mount & VFS Cache Management', () => {
    describe('isMounted', () => {
        it('is a callable function that checks volume status', () => {
            expect(typeof isMounted).toBe('function');
            // Testing on C: drive which always exists
            const cMounted = isMounted('C:');
            expect(typeof cMounted).toBe('boolean');
            expect(cMounted).toBe(true);
        });

        it('handles different path formats like Z:, Z:\\, Z:/', () => {
            const result1 = isMounted('C:');
            const result2 = isMounted('C:\\');
            const result3 = isMounted('C:/');
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
        });
    });

    describe('refreshMountVfsCache', () => {
        it('sends JSON POST body with recursive: true to rclone RC', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ result: 'ok' }),
            });
            vi.stubGlobal('fetch', fetchMock);

            const success = await refreshMountVfsCache('Media/TV Shows/Reacher');
            expect(success).toBe(true);
            expect(fetchMock).toHaveBeenCalledWith(
                'http://127.0.0.1:5572/vfs/refresh',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dir: 'Media/TV Shows/Reacher',
                        recursive: true,
                    }),
                })
            );

            vi.unstubAllGlobals();
        });

        it('refreshes entire mount when dir is omitted or empty', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ result: 'ok' }),
            });
            vi.stubGlobal('fetch', fetchMock);

            const success = await refreshMountVfsCache();
            expect(success).toBe(true);
            expect(fetchMock).toHaveBeenCalledWith(
                'http://127.0.0.1:5572/vfs/refresh',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dir: '',
                        recursive: true,
                    }),
                })
            );

            vi.unstubAllGlobals();
        });

        it('handles network / RC errors gracefully without throwing', async () => {
            const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'));
            vi.stubGlobal('fetch', fetchMock);

            const success = await refreshMountVfsCache('Media');
            expect(success).toBe(false);

            vi.unstubAllGlobals();
        });
    });

    describe('ensureDriveMounted', () => {
        it('returns a boolean promise without throwing', async () => {
            expect(typeof ensureDriveMounted).toBe('function');
            const res = await ensureDriveMounted();
            expect(typeof res).toBe('boolean');
        });
    });

    describe('getOptimizedMountArgs', () => {
        it('includes RC and streaming performance flags', () => {
            const args = getOptimizedMountArgs('gdrive', 'Z:', 'C:\\Temp');
            expect(args).toContain('--rc');
            expect(args).toContain('--rc-addr');
            expect(args).toContain('127.0.0.1:5572');
            expect(args).toContain('--vfs-cache-max-size');
            expect(args).toContain('10G');
            expect(args).toContain('--vfs-cache-max-age');
            expect(args).toContain('15m');
            expect(args).toContain('--vfs-cache-poll-interval');
            expect(args).toContain('1m');
            expect(args).toContain('--vfs-read-chunk-size');
            expect(args).toContain('2M');
            expect(args).toContain('--vfs-read-chunk-size-limit');
            expect(args).toContain('64M');
            expect(args).toContain('--vfs-read-ahead');
            expect(args).toContain('32M');
            expect(args).toContain('--vfs-handle-caching');
            expect(args).toContain('0s');
        });
    });
});
