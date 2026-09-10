import { describe, it, expect } from 'vitest';
import {
    isAria2Available,
    getAria2BinaryPath,
    parseAria2Bytes,
    parseAria2ProgressLine
} from '../lib/aria2Downloader';

describe('Aria2 Downloader', () => {
    describe('binary detection', () => {
        it('detects aria2 binary path on this system', () => {
            const path = getAria2BinaryPath();
            expect(path).not.toBeNull();
            expect(typeof path).toBe('string');
        });

        it('confirms aria2 is available and working', () => {
            expect(isAria2Available()).toBe(true);
        });
    });

    describe('parseAria2Bytes', () => {
        it('converts byte sizes correctly', () => {
            expect(parseAria2Bytes('0B')).toBe(0);
            expect(parseAria2Bytes('1024B')).toBe(1024);
            expect(parseAria2Bytes('100KB')).toBe(100 * 1024);
            expect(parseAria2Bytes('176KiB')).toBe(176 * 1024);
            expect(parseAria2Bytes('10MiB')).toBe(10 * 1024 * 1024);
            expect(parseAria2Bytes('4.5GiB')).toBe(Math.round(4.5 * 1024 * 1024 * 1024));
        });

        it('returns 0 for empty or invalid strings', () => {
            expect(parseAria2Bytes('')).toBe(0);
            expect(parseAria2Bytes('invalid')).toBe(0);
        });
    });

    describe('parseAria2ProgressLine', () => {
        it('parses active progress lines with percent, speed, and ETA', () => {
            const line = '[#420090 3.2MiB/10MiB(32%) CN:4 DL:1.5MiB ETA:4s]';
            const result = parseAria2ProgressLine(line);

            expect(result).not.toBeNull();
            expect(result?.percent).toBe(32);
            expect(result?.downloadedBytes).toBe(parseAria2Bytes('3.2MiB'));
            expect(result?.totalBytes).toBe(parseAria2Bytes('10MiB'));
            expect(result?.speedBytes).toBe(parseAria2Bytes('1.5MiB'));
            expect(result?.eta).toBe('4s');
        });

        it('parses initial lines before percent is determined', () => {
            const line = '[#420090 0B/0B CN:1 DL:0B]';
            const result = parseAria2ProgressLine(line);

            expect(result).not.toBeNull();
            expect(result?.percent).toBe(0);
            expect(result?.downloadedBytes).toBe(0);
            expect(result?.speedBytes).toBe(0);
        });

        it('returns null for non-progress lines', () => {
            expect(parseAria2ProgressLine('Downloading 1 item(s)')).toBeNull();
            expect(parseAria2ProgressLine('*** Download Progress Summary ***')).toBeNull();
            expect(parseAria2ProgressLine('09/10 19:24:10 [NOTICE] Download complete')).toBeNull();
        });
    });

    describe('downloadManager aria2 integration', () => {
        it('supports adding, pausing, resuming, and removing an aria2 HTTP download', async () => {
            const { default: downloadManager } = await import('../lib/downloader');
            const db = (await import('../lib/db')).default;

            const testUrl = 'http-direct:https://example.com/test-media.mkv';
            const dl = await downloadManager.addDownload(testUrl, undefined, undefined, 'test-aria2-integration.mkv', 'local');

            expect(dl).toBeDefined();
            expect(dl.id).toBeGreaterThan(0);
            expect(dl.status).toBe('downloading');

            // Test Pause
            const paused = await downloadManager.pauseDownload(dl.id);
            expect(paused).toBe(true);

            const pausedRecord = downloadManager.getDownload(dl.id);
            expect(pausedRecord?.status).toBe('paused');

            // Test Resume
            const resumed = await downloadManager.resumeDownload(dl.id);
            expect(resumed).toBe(true);

            const resumedRecord = downloadManager.getDownload(dl.id);
            expect(resumedRecord?.status).toBe('downloading');

            // Test Cancel / Remove
            const removed = await downloadManager.removeDownload(dl.id, true);
            expect(removed).toBe(true);

            const deletedRecord = downloadManager.getDownload(dl.id);
            expect(deletedRecord).toBeNull();
        });
    });
});
