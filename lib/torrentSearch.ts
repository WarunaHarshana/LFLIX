/**
 * Torrent Search — uses apibay.org (The Pirate Bay API) + YTS + a.111477.xyz open directory
 */

export interface TorrentResult {
    title: string;
    magnet: string;
    size: string;
    sizeBytes: number;
    seeds: number;
    leeches: number;
    quality: string;
    source: string;
    uploadDate?: string;
    uploadTimestamp?: number;
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

/** Parse a human-readable size string (e.g. "1.5 GB", "850 MB") back to bytes */
function parseSizeToBytes(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return Math.round(value * (multipliers[unit] || 0));
}

function extractQuality(title: string): string {
    const match = title.match(/(2160p|4K|UHD|1080p|720p|480p|HDRip|BDRip|BluRay|WEBRip|WEB-DL|HDTV|CAM|TS)/i);
    return match ? match[1] : 'Unknown';
}

/** Score how relevant a torrent title is to the search query (0-100) */
function relevanceScore(title: string, query: string): number {
    const normTitle = title.toLowerCase().replace(/[._\-]+/g, ' ');
    const normQuery = query.toLowerCase().replace(/[._\-]+/g, ' ');
    const queryWords = normQuery.split(/\s+/).filter(w => w.length > 1);
    
    if (queryWords.length === 0) return 0;

    let score = 0;
    let matchedWords = 0;

    for (const word of queryWords) {
        if (normTitle.includes(word)) {
            matchedWords++;
            // Bonus for exact word match (not substring)
            if (normTitle.split(/\s+/).some(w => w === word)) score += 15;
            else score += 10;
        }
    }

    // Must match at least 60% of query words
    const matchRatio = matchedWords / queryWords.length;
    if (matchRatio < 0.5) return 0;

    // Bonus for matching all words
    if (matchedWords === queryWords.length) score += 20;

    // Bonus for shorter titles (more specific matches)
    if (normTitle.length < 80) score += 10;

    // Penalty for very long titles (usually spam/pack releases)
    if (normTitle.length > 120) score -= 15;

    return Math.max(0, Math.min(100, score));
}

/** Filter and sort results by relevance */
function filterByRelevance(results: TorrentResult[], query: string, minScore: number = 30): TorrentResult[] {
    return results
        .map(r => ({ ...r, _score: relevanceScore(r.title, query) }))
        .filter(r => r._score >= minScore)
        .sort((a, b) => (b._score - a._score) || (b.seeds - a.seeds));
}

// --- apibay.org (The Pirate Bay API) ---

async function searchTPB(query: string, category: string = '200'): Promise<TorrentResult[]> {
    try {
        // Category 200 = Video, 201 = Movies, 205 = TV Shows
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=${category}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(15000),
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
                sizeBytes: parseInt(item.size) || 0,
                seeds: parseInt(item.seeders) || 0,
                leeches: parseInt(item.leechers) || 0,
                quality: extractQuality(item.name || ''),
                source: 'TPB',
                uploadDate: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : undefined,
                uploadTimestamp: item.added ? parseInt(item.added) * 1000 : undefined,
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
            signal: AbortSignal.timeout(10000),
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
                    sizeBytes: parseSizeToBytes(torrent.size || ''),
                    seeds: torrent.seeds || 0,
                    leeches: torrent.peers || 0,
                    quality: torrent.quality || 'Unknown',
                    source: 'YTS',
                    uploadDate: torrent.date_uploaded ? String(torrent.date_uploaded).split(' ')[0] : undefined,
                    uploadTimestamp: torrent.date_uploaded_unix ? parseInt(torrent.date_uploaded_unix) * 1000 : undefined,
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

// In-memory cache for directory listings (avoids re-fetching the 7800+ entry index)
const dirCache = new Map<string, { data: { name: string; href: string; sizeBytes: number }[]; ts: number }>();
const DIR_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** Fetch with retry — retries once after a delay on 429 or network error */
async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response | null> {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
            if (res.status === 429 && attempt === 0) {
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            if (!res.ok) return null;
            return res;
        } catch {
            if (attempt === 0) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return null;
        }
    }
    return null;
}

/** Fetch and parse a directory listing, with caching */
async function fetchDirectoryListing(url: string, timeoutMs: number): Promise<{ name: string; href: string; sizeBytes: number }[]> {
    const cached = dirCache.get(url);
    if (cached && Date.now() - cached.ts < DIR_CACHE_TTL) {
        return cached.data;
    }
    const res = await fetchWithRetry(url, timeoutMs);
    if (!res) return [];
    const html = await res.text();
    const entries = parseDirectoryListing(html, url);
    dirCache.set(url, { data: entries, ts: Date.now() });
    return entries;
}

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

        // Query words for filtering — only keep words with length > 1
        const fullNormalQuery = normalizeTitle(query);
        const queryWords = fullNormalQuery.split(' ').filter(w => w.length > 1);

        for (const category of categories) {
            const categoryUrl = `${OPEN_DIR_BASE}${category}`;
            try {
                // Use cached directory listing to avoid redundant fetches of the large index
                const folders = await fetchDirectoryListing(categoryUrl, 20000);
                if (folders.length === 0) continue;

                // Find matching title folders
                const matchingFolders = folders.filter(f => titleMatches(f.name, query)).slice(0, 5);

                // Fetch file listings from matching folders in parallel
                const fileListings = await Promise.allSettled(
                    matchingFolders.map(async (folder) => {
                        const folderUrl = folder.href.endsWith('/') ? folder.href : folder.href + '/';
                        const files = await fetchDirectoryListing(folderUrl, 15000);
                        if (files.length === 0) return [];

                        const mediaRegex = /\.(mkv|mp4|avi|mov|wmv|flv|webm|iso)$/i;
                        const allMediaFiles = files.filter(f => mediaRegex.test(f.name));

                        // If no media files, but subdirectories exist (likely TV seasons), fetch them
                        if (allMediaFiles.length === 0) {
                            const subDirs = files.filter(f => !mediaRegex.test(f.name) && f.href.endsWith('/'));

                            // Fetch subdirectories sequentially with a small delay to avoid rate limiting
                            for (const subDir of subDirs.slice(0, 10)) {
                                try {
                                    const subFiles = await fetchDirectoryListing(subDir.href, 15000);
                                    const subMedia = subFiles.filter(f => mediaRegex.test(f.name));
                                    allMediaFiles.push(...subMedia);
                                    // Small delay between requests to prevent 429s
                                    if (subDirs.length > 3) {
                                        await new Promise(r => setTimeout(r, 300));
                                    }
                                } catch {
                                    // Continue even if one season folder fails
                                }
                            }
                        }

                        return allMediaFiles
                            .filter(f => {
                                // Match query words against folder name + file name combined
                                // This ensures "The Last of Us" matches files inside the correct folder
                                const combined = normalizeTitle(folder.name + ' ' + f.name);
                                return queryWords.every(w => combined.includes(w));
                            })
                            .map(file => ({
                                title: file.name,
                                magnet: `http-direct:${file.href}`,
                                size: file.sizeBytes > 0 ? formatBytes(file.sizeBytes) : 'Unknown',
                                sizeBytes: file.sizeBytes > 0 ? file.sizeBytes : 0,
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

        return results.slice(0, 50);
    } catch (e) {
        console.error('Open directory search error:', e);
        return [];
    }
}

// --- Knaben API (meta-search, returns JSON) ---

async function searchKnaben(query: string): Promise<TorrentResult[]> {
    try {
        const url = `https://api.knaben.org/v1?query=${encodeURIComponent(query)}&limit=50`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];

        const data = await res.json();
        if (!data?.hits || !Array.isArray(data.hits)) return [];

        return data.hits
            .filter((item: any) => {
                // Filter out adult content and zero-size
                const cat = (item.category || '').toLowerCase();
                if (cat.includes('xxx') || cat.includes('adult') || cat.includes('porn')) return false;
                if (!item.bytes || item.bytes <= 0) return false;
                // Must have at least 1 seeder
                if (!item.seeders || item.seeders < 1) return false;
                return true;
            })
            .sort((a: any, b: any) => (b.seeders || 0) - (a.seeders || 0))
            .slice(0, 20)
            .map((item: any) => ({
                title: item.title || 'Unknown',
                magnet: item.magnet || `magnet:?xt=urn:btih:${item.infoHash || ''}&dn=${encodeURIComponent(item.title || '')}`,
                size: formatBytes(item.bytes || 0),
                sizeBytes: item.bytes || 0,
                seeds: item.seeders || 0,
                leeches: item.leechers || 0,
                quality: extractQuality(item.title || ''),
                source: item.cachedOrigin ? item.cachedOrigin.replace(' python scraper', '') : 'Knaben',
                uploadDate: item.date ? item.date.split('T')[0] : undefined,
            }));
    } catch (e) {
        console.error('Knaben search error:', e);
        return [];
    }
}

// --- Nyaa.si (anime/torrents, HTML scrape) ---

async function searchNyaa(query: string): Promise<TorrentResult[]> {
    try {
        const url = `https://nyaa.si/?q=${encodeURIComponent(query)}&s=seeders&o=desc`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];

        const html = await res.text();
        const results: TorrentResult[] = [];

        // Parse table rows
        const rowRegex = /<tr class="(?:default|success)">[\s\S]*?<a href="\/\?q=[^"]*"[^>]*title="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a href="(magnet:[^"]*)"[^>]*>[\s\S]*?<td class="text-center">([\d.]+ [KMG]?i?B)<\/td>[\s\S]*?<td class="text-center">(\d+)<\/td>[\s\S]*?<td class="text-center">(\d+)<\/td>/gi;

        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const title = match[1].trim() || match[2].trim();
            results.push({
                title,
                magnet: match[3],
                size: match[4],
                sizeBytes: parseSizeToBytes(match[4]),
                seeds: parseInt(match[5]) || 0,
                leeches: parseInt(match[6]) || 0,
                quality: extractQuality(title),
                source: 'Nyaa',
            });
        }

        return results.slice(0, 15);
    } catch (e) {
        console.error('Nyaa search error:', e);
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

    // Search ALL sources in parallel — working ones contribute, blocked ones fail silently
    const [tpbResults, ytsResults, knabenResults, nyaaResults, ddlResults] = await Promise.allSettled([
        searchTPB(query, tpbCategory),
        options?.type !== 'tv' ? searchYTS(title, options?.year) : Promise.resolve([]),
        searchKnaben(query),
        searchNyaa(query),
        searchOpenDirectory(title, options?.type),
    ]);

    const torrentResults: TorrentResult[] = [
        ...(tpbResults.status === 'fulfilled' ? tpbResults.value : []),
        ...(ytsResults.status === 'fulfilled' ? ytsResults.value : []),
        ...(knabenResults.status === 'fulfilled' ? knabenResults.value : []),
        ...(nyaaResults.status === 'fulfilled' ? nyaaResults.value : []),
    ];

    // Log source status for debugging
    const sourceStatus = [
        `TPB=${tpbResults.status === 'fulfilled' ? tpbResults.value.length : 'fail'}`,
        `YTS=${ytsResults.status === 'fulfilled' ? ytsResults.value.length : 'fail'}`,
        `Knaben=${knabenResults.status === 'fulfilled' ? knabenResults.value.length : 'fail'}`,
        `Nyaa=${nyaaResults.status === 'fulfilled' ? nyaaResults.value.length : 'fail'}`,
        `DDL=${ddlResults.status === 'fulfilled' ? ddlResults.value.length : 'fail'}`,
    ];
    console.log(`[TorrentSearch] ${sourceStatus.join(', ')} — ${torrentResults.length} torrent results total`);

    // Deduplicate by normalized title
    const seen = new Set();
    const unique = torrentResults.filter(t => {
        const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Filter by relevance to search query — removes random/unrelated results
    const relevant = filterByRelevance(unique, title, 25);

    // Append DDL results after torrent results
    const ddl = ddlResults.status === 'fulfilled' ? ddlResults.value : [];

    return [...relevant, ...ddl];
}
