/**
 * Enhanced BitTorrent Trackers for LFLIX
 * Curated list of high-speed Tier-1 public trackers across UDP, HTTPS, HTTP, and WebSocket (WSS) protocols.
 * Sources: ngosang/trackerslist (best & all), newTrackon live status.
 */

export const ENHANCED_TRACKERS: readonly string[] = [
    // --- Tier-1 UDP Trackers (Maximum Swarm Discovery & High-Bandwidth Seeders) ---
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.therarbg.to:6969/announce',
    'udp://tracker.publictracker.xyz:6969/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker-udp.gbitt.info:80/announce',
    'udp://tracker.qu.ax:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://explodie.org:6969/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://leet-tracker.moe:1337/announce',
    'udp://p4p.arenabg.com:1337/announce',
    'udp://zer0day.ch:1337/announce',
    'udp://tracker.auctor.tv:6969/announce',
    'udp://tracker.corpscorp.online:80/announce',
    'udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce',

    // --- Tier-1 HTTPS / HTTP Trackers (Bypasses UDP filtering, VPN drops, & ISP firewalls) ---
    'https://tracker.tamersunion.org:443/announce',
    'https://tracker.zhuqiy.com:443/announce',
    'https://tracker.bt4g.com:443/announce',
    'https://004430.xyz:443/announce',
    'https://tracker.pmman.tech:443/announce',
    'https://tracker.nekomi.cn:443/announce',
    'https://ht.therarbg.to:443/announce',
    'http://tracker.opentrackr.org:1337/announce',
    'http://tracker.bt4g.com:2095/announce',

    // --- WebSocket (WSS) Trackers (WebTorrent WebRTC Swarm & Browser Seeds) ---
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.webtorrent.dev',
    'wss://tracker.files.fm:7073/announce',
];

/**
 * Returns a mutable copy of the enhanced trackers list.
 */
export function getEnhancedTrackers(): string[] {
    return [...ENHANCED_TRACKERS];
}

/**
 * Normalize tracker URL for deduplication.
 */
function normalizeTrackerUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Enriches any magnet URI with the enhanced tracker list.
 * Deduplicates existing trackers and appends missing high-speed trackers.
 */
export function enrichMagnetUri(magnetUri: string, extraTrackers?: string[]): string {
    if (!magnetUri || !magnetUri.startsWith('magnet:?')) {
        return magnetUri;
    }

    try {
        // Auto-heal if xt colons were previously encoded as %3A (which breaks WebTorrent / magnet-uri parser)
        let fixed = magnetUri.replace(/([?&]xt=)urn%3Abtih%3A/gi, '$1urn:btih:');

        // Extract existing tr= entries without re-encoding the entire query string
        const seen = new Set<string>();
        const trackerRegex = /[?&]tr=([^&]+)/gi;
        let match: RegExpExecArray | null;

        while ((match = trackerRegex.exec(fixed)) !== null) {
            try {
                seen.add(normalizeTrackerUrl(decodeURIComponent(match[1])));
            } catch {
                seen.add(normalizeTrackerUrl(match[1]));
            }
        }

        const combinedTrackers = [...(extraTrackers || []), ...ENHANCED_TRACKERS];
        let result = fixed;

        for (const tracker of combinedTrackers) {
            const normalized = normalizeTrackerUrl(tracker);
            if (!seen.has(normalized)) {
                seen.add(normalized);
                result += (result.includes('?') ? '&' : '?') + 'tr=' + encodeURIComponent(tracker);
            }
        }

        return result;
    } catch {
        return magnetUri;
    }
}
