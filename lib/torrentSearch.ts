/**
 * Torrent Search — scrapes 1337x and YTS for torrent results
 */

export interface TorrentResult {
    title: string;
    magnet: string;
    size: string;
    seeds: number;
    leeches: number;
    quality: string;
    source: '1337x' | 'YTS';
    uploadDate?: string;
}

// Rate limiter
let lastSearchCall = 0;
const SEARCH_DELAY_MS = 1000;

async function rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSince = now - lastSearchCall;
    if (timeSince < SEARCH_DELAY_MS) {
        await new Promise(r => setTimeout(r, SEARCH_DELAY_MS - timeSince));
    }
    lastSearchCall = Date.now();
    return fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
}

// --- YTS API (movies only, public JSON API) ---

async function searchYTS(query: string, year?: string): Promise<TorrentResult[]> {
    try {
        const params = new URLSearchParams({ query_term: query, limit: '10', sort_by: 'seeds' });
        const res = await rateLimitedFetch(`https://yts.mx/api/v2/list_movies.json?${params}`);
        if (!res.ok) return [];

        const data = await res.json();
        const movies = data?.data?.movies;
        if (!movies || !Array.isArray(movies)) return [];

        const results: TorrentResult[] = [];

        for (const movie of movies) {
            if (!movie.torrents) continue;

            // If year specified, check match
            if (year && movie.year && String(movie.year) !== year) continue;

            for (const torrent of movie.torrents) {
                // Build magnet link from hash
                const trackers = [
                    'udp://open.demonii.com:1337/announce',
                    'udp://tracker.openbittorrent.com:80',
                    'udp://tracker.coppersurfer.tk:6969',
                    'udp://glotorrents.pw:6969/announce',
                    'udp://tracker.opentrackr.org:1337/announce',
                    'udp://torrent.gresille.org:80/announce',
                    'udp://p4p.arenabg.com:1337',
                    'udp://tracker.leechers-paradise.org:6969',
                ];

                const name = `${movie.title} (${movie.year}) [${torrent.quality}] [YTS]`;
                const magnet = `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(name)}${trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('')}`;

                results.push({
                    title: name,
                    magnet,
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
        console.error('YTS search error:', e);
        return [];
    }
}

// --- 1337x scrape ---

async function search1337x(query: string): Promise<TorrentResult[]> {
    try {
        const searchUrl = `https://1337x.to/search/${encodeURIComponent(query)}/1/`;
        const res = await rateLimitedFetch(searchUrl);
        if (!res.ok) return [];

        const html = await res.text();
        const results: TorrentResult[] = [];

        // Parse search results page — extract links to detail pages
        const rowRegex = /<td class="coll-1 name">[\s\S]*?<a href="(\/torrent\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td class="coll-2 seeds">(\d+)<\/td>\s*<td class="coll-3 leeches">(\d+)<\/td>[\s\S]*?<td class="coll-4[^"]*">([^<]+)<\/td>/g;

        let match;
        const detailLinks: { path: string; title: string; seeds: number; leeches: number; size: string }[] = [];

        while ((match = rowRegex.exec(html)) !== null && detailLinks.length < 10) {
            detailLinks.push({
                path: match[1],
                title: match[2].trim(),
                seeds: parseInt(match[3]) || 0,
                leeches: parseInt(match[4]) || 0,
                size: match[5]?.trim() || 'Unknown',
            });
        }

        // Fetch magnet links from detail pages (limit to top 5 to avoid too many requests)
        const top = detailLinks.slice(0, 5);
        for (const link of top) {
            try {
                const detailRes = await rateLimitedFetch(`https://1337x.to${link.path}`);
                if (!detailRes.ok) continue;

                const detailHtml = await detailRes.text();
                const magnetMatch = detailHtml.match(/href="(magnet:\?[^"]+)"/);
                if (!magnetMatch) continue;

                // Extract quality from title
                let quality = 'Unknown';
                const qualityMatch = link.title.match(/(2160p|4K|1080p|720p|480p|HDRip|BDRip|BluRay|WEBRip|WEB-DL|HDTV)/i);
                if (qualityMatch) quality = qualityMatch[1];

                results.push({
                    title: link.title,
                    magnet: magnetMatch[1],
                    size: link.size,
                    seeds: link.seeds,
                    leeches: link.leeches,
                    quality,
                    source: '1337x',
                });
            } catch {
                // Skip failed detail pages
            }
        }

        return results;
    } catch (e) {
        console.error('1337x search error:', e);
        return [];
    }
}

// --- Combined search ---

export async function searchTorrents(
    title: string,
    options?: { year?: string; type?: 'movie' | 'tv' }
): Promise<TorrentResult[]> {
    const query = options?.year ? `${title} ${options.year}` : title;

    // Search both sources in parallel
    const [ytsResults, l337xResults] = await Promise.all([
        options?.type !== 'tv' ? searchYTS(title, options?.year) : Promise.resolve([]),
        search1337x(query),
    ]);

    // Combine and sort by seeds descending
    const allResults = [...ytsResults, ...l337xResults];
    allResults.sort((a, b) => b.seeds - a.seeds);

    return allResults;
}
