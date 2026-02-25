/**
 * Torrent Search — uses apibay.org (The Pirate Bay API) + YTS fallback
 */

export interface TorrentResult {
    title: string;
    magnet: string;
    size: string;
    seeds: number;
    leeches: number;
    quality: string;
    source: string;
    uploadDate?: string;
}

// Standard trackers for magnet links
const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969',
];

function buildMagnet(infoHash: string, name: string): string {
    const trackerParams = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackerParams}`;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function extractQuality(title: string): string {
    const match = title.match(/(2160p|4K|UHD|1080p|720p|480p|HDRip|BDRip|BluRay|WEBRip|WEB-DL|HDTV|CAM|TS)/i);
    return match ? match[1] : 'Unknown';
}

// --- apibay.org (The Pirate Bay API) ---

async function searchTPB(query: string, category: string = '200'): Promise<TorrentResult[]> {
    try {
        // Category 200 = Video, 201 = Movies, 205 = TV Shows
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=${category}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) return [];

        const data = await res.json();

        // apibay returns [{"id":"0","name":"No results returned"}] when no results
        if (!Array.isArray(data) || data.length === 0 || data[0]?.id === '0') {
            return [];
        }

        return data
            .filter((item: any) => item.seeders && parseInt(item.seeders) > 0)
            .slice(0, 20)
            .map((item: any) => ({
                title: item.name || 'Unknown',
                magnet: buildMagnet(item.info_hash, item.name),
                size: formatBytes(parseInt(item.size) || 0),
                seeds: parseInt(item.seeders) || 0,
                leeches: parseInt(item.leechers) || 0,
                quality: extractQuality(item.name || ''),
                source: 'TPB',
                uploadDate: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : undefined,
            }));
    } catch (e) {
        console.error('TPB search error:', e);
        return [];
    }
}

// --- YTS API (movies only, small high-quality encodes) ---

async function searchYTS(query: string, year?: string): Promise<TorrentResult[]> {
    try {
        const params = new URLSearchParams({ query_term: query, limit: '10', sort_by: 'seeds' });
        const res = await fetch(`https://yts.mx/api/v2/list_movies.json?${params}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [];

        const data = await res.json();
        const movies = data?.data?.movies;
        if (!movies || !Array.isArray(movies)) return [];

        const results: TorrentResult[] = [];

        for (const movie of movies) {
            if (!movie.torrents) continue;
            if (year && movie.year && String(movie.year) !== year) continue;

            for (const torrent of movie.torrents) {
                const name = `${movie.title} (${movie.year}) [${torrent.quality}] [YTS]`;
                results.push({
                    title: name,
                    magnet: buildMagnet(torrent.hash, name),
                    size: torrent.size || 'Unknown',
                    seeds: torrent.seeds || 0,
                    leeches: torrent.peers || 0,
                    quality: torrent.quality || 'Unknown',
                    source: 'YTS',
                });
            }
        }

        return results;
    } catch (e) {
        // YTS is often blocked — fail silently
        console.error('YTS search error (may be blocked):', e);
        return [];
    }
}

// --- Combined search ---

export async function searchTorrents(
    title: string,
    options?: { year?: string; type?: 'movie' | 'tv' }
): Promise<TorrentResult[]> {
    const query = options?.year ? `${title} ${options.year}` : title;

    // Determine TPB category: 201 = Movies, 205 = TV, 200 = all video
    const tpbCategory = options?.type === 'tv' ? '205' : options?.type === 'movie' ? '201' : '200';

    // Search all sources in parallel — don't let one failure block the others
    const [tpbResults, ytsResults] = await Promise.allSettled([
        searchTPB(query, tpbCategory),
        options?.type !== 'tv' ? searchYTS(title, options?.year) : Promise.resolve([]),
    ]);

    const allResults: TorrentResult[] = [
        ...(tpbResults.status === 'fulfilled' ? tpbResults.value : []),
        ...(ytsResults.status === 'fulfilled' ? ytsResults.value : []),
    ];

    // Sort by seeds descending
    allResults.sort((a, b) => b.seeds - a.seeds);

    return allResults;
}
