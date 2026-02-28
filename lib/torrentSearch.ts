/**
 * Torrent Search — uses apibay.org (The Pirate Bay API) + YTS + a.111477.xyz open directory
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

// --- a.111477.xyz open directory (direct downloads) ---

const OPEN_DIR_BASE = 'https://a.111477.xyz';
const OPEN_DIR_CATEGORIES: Record<string, string[]> = {
    movie: ['/movies/'],
    tv: ['/tvs/'],
    all: ['/movies/', '/tvs/'],
};

/** Normalize a title for fuzzy comparison */
function normalizeTitle(t: string): string {
    return t
        .toLowerCase()
        .replace(/[\(\)\[\]\{\}'"!@#$%^&*,.:;]/g, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extract entries from the HTML index page (uses data-entry table rows) */
function parseDirectoryListing(html: string, baseUrl: string): { name: string; href: string; sizeBytes: number }[] {
    const entries: { name: string; href: string; sizeBytes: number }[] = [];
    // Match all <tr data-entry="true" ...> rows — attributes can be in any order
    const rowRegex = /<tr[^>]+data-entry="true"[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
        const fullTag = match[0];
        const rowContent = match[1];
        // Extract data-name and data-url from the tr tag
        const nameMatch = fullTag.match(/data-name="([^"]*)"/);
        const urlMatch = fullTag.match(/data-url="([^"]*)"/);
        if (!nameMatch || !urlMatch) continue;
        const name = nameMatch[1].trim();
        const dataUrl = urlMatch[1].trim();
        // Skip parent directory
        if (name === '..' || name === '.' || name === '../') continue;
        // Extract size from <td class="size" data-sort="bytes">
        let sizeBytes = -1;
        const sizeMatch = rowContent.match(/data-sort="(-?\d+)"/);
        if (sizeMatch) {
            sizeBytes = parseInt(sizeMatch[1], 10);
        }

        // Safely decode name
        let decodedName = name;
        try {
            decodedName = decodeURIComponent(name);
        } catch {
            decodedName = unescape(name); // fallback
        }

        // Resolve URL
        const fullHref = dataUrl.startsWith('http')
            ? dataUrl
            : `${OPEN_DIR_BASE}${dataUrl}`;
        entries.push({ name: decodedName.replace(/\/$/, ''), href: fullHref, sizeBytes });
    }
    return entries;
}

/** Check if folder name matches search query (fuzzy). Ignores season/episode numbers and resolutions for folder matching. */
function titleMatches(folderName: string, query: string): boolean {
    const normalFolder = normalizeTitle(folderName);
    const normalQuery = normalizeTitle(query);

    // Filter out typical season/episode patterns (e.g. s01e01, 1080p) from query words when matching root folders
    const ignoreRegex = /^(s\d+e\d+|s\d+|\d{3,4}p|4k|uhd)$/;
    const queryWords = normalQuery.split(' ').filter(w => w.length > 1 && !ignoreRegex.test(w));

    // All significant non-episode query words must appear in the folder name
    return queryWords.every(word => normalFolder.includes(word));
}

async function searchOpenDirectory(query: string, type?: 'movie' | 'tv'): Promise<TorrentResult[]> {
    try {
        const categories = type ? (OPEN_DIR_CATEGORIES[type] || OPEN_DIR_CATEGORIES.all) : OPEN_DIR_CATEGORIES.all;
        const results: TorrentResult[] = [];

        // Full query string for filtering actual media files later
        const fullNormalQuery = normalizeTitle(query);
        const queryWords = fullNormalQuery.split(' ').filter(w => w.length > 1);

        for (const category of categories) {
            const categoryUrl = `${OPEN_DIR_BASE}${category}`;
            try {
                const res = await fetch(categoryUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    signal: AbortSignal.timeout(15000),
                });
                if (!res.ok) continue;

                const html = await res.text();
                const folders = parseDirectoryListing(html, categoryUrl);

                // Find matching title folders
                const matchingFolders = folders.filter(f => titleMatches(f.name, query)).slice(0, 5);

                // Fetch file listings from matching folders in parallel
                const fileListings = await Promise.allSettled(
                    matchingFolders.map(async (folder) => {
                        const folderUrl = folder.href.endsWith('/') ? folder.href : folder.href + '/';
                        const fRes = await fetch(folderUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            signal: AbortSignal.timeout(10000),
                        });
                        if (!fRes.ok) return [];
                        const fHtml = await fRes.text();
                        const files = parseDirectoryListing(fHtml, folderUrl);

                        const mediaRegex = /\.(mkv|mp4|avi|mov|wmv|flv|webm|iso)$/i;
                        const allMediaFiles = files.filter(f => mediaRegex.test(f.name));

                        // If no media files, but subdirectories exist (likely TV seasons), fetch them
                        if (allMediaFiles.length === 0) {
                            const subDirs = files.filter(f => !mediaRegex.test(f.name) && f.href.endsWith('/'));

                            // Fetch subdirectories in parallel (limit to 10 to avoid hammering the server)
                            const subResults = await Promise.allSettled(
                                subDirs.slice(0, 10).map(async (subDir) => {
                                    const subRes = await fetch(subDir.href, {
                                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                                        signal: AbortSignal.timeout(10000),
                                    });
                                    if (!subRes.ok) return [];
                                    const subHtml = await subRes.text();
                                    const subFiles = parseDirectoryListing(subHtml, subDir.href);
                                    return subFiles.filter(f => mediaRegex.test(f.name));
                                })
                            );

                            for (const sub of subResults) {
                                if (sub.status === 'fulfilled') {
                                    allMediaFiles.push(...sub.value);
                                }
                            }
                        }

                        return allMediaFiles
                            // Filter by the FULL query to ensure users only see matching episodes (e.g. S01E01)
                            .filter(f => {
                                const nf = normalizeTitle(f.name);
                                return queryWords.every(w => nf.includes(w));
                            })
                            .map(file => ({
                                title: file.name,
                                magnet: `http-direct:${file.href}`,
                                size: file.sizeBytes > 0 ? formatBytes(file.sizeBytes) : 'Unknown',
                                seeds: 0,
                                leeches: 0,
                                quality: extractQuality(file.name),
                                source: 'DDL',
                            }));
                    })
                );

                for (const listing of fileListings) {
                    if (listing.status === 'fulfilled') {
                        results.push(...listing.value);
                    }
                }
            } catch (e) {
                console.error(`Open directory search error for ${category}:`, e);
            }
        }

        return results.slice(0, 30);
    } catch (e) {
        console.error('Open directory search error:', e);
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
    const [tpbResults, ytsResults, ddlResults] = await Promise.allSettled([
        searchTPB(query, tpbCategory),
        options?.type !== 'tv' ? searchYTS(title, options?.year) : Promise.resolve([]),
        searchOpenDirectory(title, options?.type),
    ]);

    const torrentResults: TorrentResult[] = [
        ...(tpbResults.status === 'fulfilled' ? tpbResults.value : []),
        ...(ytsResults.status === 'fulfilled' ? ytsResults.value : []),
    ];

    // Sort torrents by seeds descending
    torrentResults.sort((a, b) => b.seeds - a.seeds);

    // Append DDL results after torrent results (DDL has no seeds to sort by)
    const ddl = ddlResults.status === 'fulfilled' ? ddlResults.value : [];

    return [...torrentResults, ...ddl];
}
