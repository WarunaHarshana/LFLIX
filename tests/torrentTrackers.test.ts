import { describe, it, expect } from 'vitest';
import {
    ENHANCED_TRACKERS,
    getEnhancedTrackers,
    enrichMagnetUri,
} from '@/lib/torrentTrackers';

describe('Enhanced BitTorrent Trackers', () => {
    it('contains a robust list of UDP, HTTPS, and WSS trackers', () => {
        expect(ENHANCED_TRACKERS.length).toBeGreaterThan(20);

        const hasUdp = ENHANCED_TRACKERS.some((t) => t.startsWith('udp://'));
        const hasHttps = ENHANCED_TRACKERS.some((t) => t.startsWith('https://') || t.startsWith('http://'));
        const hasWss = ENHANCED_TRACKERS.some((t) => t.startsWith('wss://'));

        expect(hasUdp).toBe(true);
        expect(hasHttps).toBe(true);
        expect(hasWss).toBe(true);
    });

    it('returns a mutable copy via getEnhancedTrackers', () => {
        const copy = getEnhancedTrackers();
        expect(copy.length).toBe(ENHANCED_TRACKERS.length);
        copy.push('udp://fake-tracker:1234/announce');
        expect(ENHANCED_TRACKERS.length).toBe(copy.length - 1);
    });

    describe('enrichMagnetUri', () => {
        it('appends enhanced trackers to a raw magnet without any trackers', () => {
            const rawMagnet = 'magnet:?xt=urn:btih:5fe2b92919310674fd6d0f0593992ec4323de66b&dn=Cocktail%202';
            const enriched = enrichMagnetUri(rawMagnet);

            expect(enriched).toContain('xt=urn%3Abtih%3A5fe2b92919310674fd6d0f0593992ec4323de66b');
            expect(enriched).toContain('dn=Cocktail+2');
            expect(enriched).toContain('tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce');
            expect(enriched).toContain('tr=https%3A%2F%2Ftracker.bt4g.com%3A443%2Fannounce');
        });

        it('deduplicates existing trackers and preserves them', () => {
            const magnetWithTracker = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';
            const enriched = enrichMagnetUri(magnetWithTracker);

            // Should only have one occurrence of the exact udp://tracker.opentrackr.org tracker
            const occurrences = (enriched.match(/udp%3A%2F%2Ftracker\.opentrackr\.org%3A1337%2Fannounce/g) || []).length;
            expect(occurrences).toBe(1);

            // But should now also have other trackers
            expect(enriched).toContain('tracker.torrent.eu.org');
        });

        it('leaves non-magnet strings untouched', () => {
            const httpUrl = 'http-direct:https://storage.googleapis.com/test.mp4';
            expect(enrichMagnetUri(httpUrl)).toBe(httpUrl);

            const filePath = 'C:\\Media\\test.mkv';
            expect(enrichMagnetUri(filePath)).toBe(filePath);
        });
    });
});
