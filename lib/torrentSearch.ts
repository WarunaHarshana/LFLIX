/**
 * Torrent Search — uses apibay.org (The Pirate Bay API) + YTS + PSArips + a.111477.xyz open directory
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

export type TorrentSourceName = 'PSA' | 'TPB' | 'YTS' | 'Knaben' | 'Nyaa' | 'DDL';

export type TorrentSourceStatus = {
    name: TorrentSourceName;
    status: 'ok' | 'timeout' | 'error';
    results: number;
    durationMs: number;
    error?: string;
    cached?: boolean;
};

export type TorrentSearchDiagnostics = {
    results: TorrentResult[];
    sources: TorrentSourceStatus[];
    cached: boolean;
    tookMs: number;
};

type TPBItem = {
    id?: string;
    name?: string;
    info_hash?: string;
    size?: string;
    seeders?: string;
    leechers?: string;
    added?: string;
};

type KnabenHit = {
    title?: string;
    magnet?: string;
    magnetUrl?: string;
    hash?: string;
    bytes?: number;
    seeders?: number;
    leechers?: number;
    category?: string;
    cachedOrigin?: string;
    date?: string;
};

type KnabenResponse = {
    hits?: KnabenHit[];
};

type PsaFeedItem = {
    title: string;
    link: string;
    pubDate?: string;
    timestamp?: number;
};

type PsaRelease = {
    title: string;
    torrentUrl?: string;
    size?: string;
    sizeBytes: number;
};

type SearchOptions = { year?: string; type?: 'movie' | 'tv' };
type SearchCacheEntry = { ts: number; data: TorrentSearchDiagnostics };

// Standard trackers for magnet links
const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://open.stealth.si:80/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker-udp.gbitt.info:80/announce',
    'udp://tracker.birkenwald.de:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://explodie.org:6969/announce',
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
}

async function runSource(
    name: TorrentSourceName,
    timeoutMs: number,
    search: () => Promise<TorrentResult[]>
): Promise<{ results: TorrentResult[]; status: TorrentSourceStatus }> {
    const started = Date.now();
    try {
        const results = await Promise.race([
            search(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)),
        ]);

        return {
            results,
            status: {
                name,
                status: 'ok',
                results: results.length,
                durationMs: Date.now() - started,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Source failed';
        const timedOut = /timed out/i.test(message);
        return {
            results: [],
            status: {
                name,
                status: timedOut ? 'timeout' : 'error',
                results: 0,
                durationMs: Date.now() - started,
                error: message,
            },
        };
    }
}

function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Parse a human-readable size string (e.g. "1.5 GB", "850 MB") back to bytes */
function parseSizeToBytes(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase().replace('IB', 'B');
    const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return Math.round(value * (multipliers[unit] || 0));
}

function extractQuality(title: string): string {
    const match = title.match(/(2160p|4K|UHD|1080p|720p|480p|HDRip|BDRip|BluRay|WEBRip|WEB-DL|HDTV|HDCAM|CAM|TS|TC|TeleSync|Telecine)/i);
    return match ? match[1] : 'Unknown';
}

export function isCamQualityResult(result: Pick<TorrentResult, 'title' | 'quality'>): boolean {
    const haystack = `${result.title} ${result.quality}`.toLowerCase();
    return /\b(?:cam|hdcam|ts|telesync|telecine|tc|xbet|hd-?cam|camrip)\b/i.test(haystack);
}

export function isGoodMovieReleaseQuality(result: Pick<TorrentResult, 'title' | 'quality' | 'source'>): boolean {
    if (isCamQualityResult(result)) return false;

    const haystack = `${result.title} ${result.quality} ${result.source}`.toLowerCase();
    if (/\b(?:web[\s.-]?dl|web[\s.-]?rip|bluray|blu[\s.-]?ray|bdrip|br[-\s]?rip|remux|hdrip|dvdrip)\b/i.test(haystack)) {
        return true;
    }

    // YTS only publishes finished movie encodes, so a resolution-tagged YTS result is acceptable.
    if (result.source === 'YTS' && /\b(?:720p|1080p|2160p|4k|uhd)\b/i.test(haystack)) {
        return true;
    }

    return false;
}

function extractYears(title: string): number[] {
    const matches = title.match(/\b(19|20)\d{2}\b/g) || [];
    const years = matches.map(y => parseInt(y, 10)).filter(y => y >= 1900 && y <= 2099);
    return Array.from(new Set(years));
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

function getSignificantQueryWords(query: string): string[] {
    return normalizeTitle(query)
        .split(' ')
        .filter(w => w.length > 1 && !/^(19|20)\d{2}$/.test(w));
}

function getSignificantTvQueryWords(query: string): string[] {
    return normalizeTitle(query)
        .split(' ')
        .filter(w =>
            w.length > 1 &&
            !/^(19|20)\d{2}$/.test(w) &&
            !/^s\d{1,2}e\d{1,3}$/.test(w) &&
            !/^\d{1,2}x\d{1,3}$/.test(w) &&
            !/^s\d{1,2}$/.test(w) &&
            !/^\d{3,4}p$/.test(w) &&
            !/^(4k|uhd|hdr|hevc|x264|x265|web|webdl|web-dl|webrip|bluray|hdtv)$/.test(w)
        );
}

function extractEpisodeQuery(query: string): { season: number; episode: number } | null {
    const sxxexx = query.match(/\bs(\d{1,2})\s*[\W_]*\s*e(\d{1,3})\b/i);
    if (sxxexx) {
        return { season: parseInt(sxxexx[1], 10), episode: parseInt(sxxexx[2], 10) };
    }

    const xFormat = query.match(/\b(\d{1,2})x(\d{1,3})\b/i);
    if (xFormat) {
        return { season: parseInt(xFormat[1], 10), episode: parseInt(xFormat[2], 10) };
    }

    return null;
}

function extractEpisodeKey(title: string): string | null {
    const episode = extractEpisodeQuery(title);
    if (!episode) return null;
    return `s${String(episode.season).padStart(2, '0')}e${String(episode.episode).padStart(2, '0')}`;
}

function titleMatchesEpisode(title: string, episodeQuery: { season: number; episode: number }): boolean {
    const compact = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const season = String(episodeQuery.season);
    const episode = String(episodeQuery.episode);
    const seasonPadded = season.padStart(2, '0');
    const episodePadded = episode.padStart(2, '0');

    const tokens = [
        `s${season}e${episode}`,
        `s${season}e${episodePadded}`,
        `s${seasonPadded}e${episode}`,
        `s${seasonPadded}e${episodePadded}`,
        `${season}x${episode}`,
        `${season}x${episodePadded}`,
    ];

    return tokens.some(token => compact.includes(token));
}

function titleContainsQueryWord(normTitle: string, word: string): boolean {
    const titleWords = normTitle.split(' ');
    if (titleWords.includes(word) || normTitle.includes(word)) return true;

    const romanAlternates: Record<string, string[]> = {
        ii: ['2', 'two'],
        iii: ['3', 'three'],
        iv: ['4', 'four'],
        v: ['5', 'five'],
        vi: ['6', 'six'],
        vii: ['7', 'seven'],
        viii: ['8', 'eight'],
        ix: ['9', 'nine'],
        x: ['10', 'ten'],
    };

    return (romanAlternates[word] || []).some(alt => titleWords.includes(alt));
}

function matchesMovieTitleStrictly(title: string, query: string): boolean {
    const normTitle = normalizeTitle(title);
    const words = getSignificantQueryWords(query);
    if (words.length === 0) return true;

    const matchedWords = words.filter(word => titleContainsQueryWord(normTitle, word));

    // Sequels and short movie titles need a stricter match. This prevents
    // "Mortal Kombat" from satisfying "Mortal Kombat II".
    if (words.length <= 3) {
        return matchedWords.length === words.length;
    }

    return matchedWords.length / words.length >= 0.75;
}

function matchesTvTitleStrictly(title: string, query: string): boolean {
    const episodeQuery = extractEpisodeQuery(query);
    if (episodeQuery && !titleMatchesEpisode(title, episodeQuery)) {
        return false;
    }

    const normTitle = normalizeTitle(title);
    const words = getSignificantTvQueryWords(query);
    if (words.length === 0) return true;

    const matchedWords = words.filter(word => titleContainsQueryWord(normTitle, word));

    if (words.length <= 2) {
        const titleWords = normTitle.split(' ');
        return words.every((word, index) => titleWords[index] === word);
    }

    return matchedWords.length / words.length >= 0.75;
}

/** Filter and sort results by relevance */
function filterByRelevance(
    results: TorrentResult[],
    query: string,
    minScore: number = 30,
    options?: { year?: string; type?: 'movie' | 'tv' }
): TorrentResult[] {
    const targetYear = options?.year ? parseInt(options.year, 10) : NaN;
    const useYearFilter = (options?.type === 'movie' || options?.type === 'tv') && Number.isFinite(targetYear);

    return results
        .filter(r => options?.type !== 'movie' || matchesMovieTitleStrictly(r.title, query))
        .filter(r => options?.type !== 'tv' || matchesTvTitleStrictly(r.title, query))
        .map(r => {
            const baseScore = relevanceScore(r.title, query);
            if (!useYearFilter) {
                return { ...r, _score: baseScore, _yearBonus: 0, _hasExactYear: false, _hasConflictingYear: false };
            }

            const years = extractYears(r.title);
            const hasExactYear = years.includes(targetYear);
            const hasConflictingYear = years.length > 0 && !hasExactYear;

            // Prefer exact year heavily for movie queries with a given year.
            let yearBonus = 0;
            if (hasExactYear) yearBonus += 30;
            else if (hasConflictingYear) yearBonus -= 40;
            else yearBonus += 5; // No explicit year still acceptable.

            return {
                ...r,
                _score: baseScore + yearBonus,
                _yearBonus: yearBonus,
                _hasExactYear: hasExactYear,
                _hasConflictingYear: hasConflictingYear,
            };
        })
        .filter(r => !(useYearFilter && r._hasConflictingYear))
        .filter(r => r._score >= minScore)
        .sort((a, b) => {
            if (a._hasExactYear !== b._hasExactYear) return a._hasExactYear ? -1 : 1;
            return (b._score - a._score) || (b.seeds - a.seeds);
        });
}

// --- apibay.org (The Pirate Bay API) ---

async function searchTPB(query: string, category: string = '200'): Promise<TorrentResult[]> {
    const apiBases = [
        'https://apibay.isohunt.to',
        'https://apibay.org',
    ];

    for (const base of apiBases) {
        try {
            // Category 200 = Video, 201 = Movies, 205 = TV Shows
            const url = `${base}/q.php?q=${encodeURIComponent(query)}&cat=${category}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(12000),
            });

            if (!res.ok) continue;

            const data = await res.json() as TPBItem[];

            // apibay returns [{"id":"0","name":"No results returned"}] when no results
            if (!Array.isArray(data) || data.length === 0 || data[0]?.id === '0') {
                continue;
            }

            return data
                .filter((item) => item.seeders && parseInt(item.seeders, 10) > 0)
                .slice(0, 30)
                .map((item) => {
                    const title = item.name || 'Unknown';
                    const sizeBytes = parseInt(item.size || '0', 10) || 0;
                    const uploadTimestamp = item.added ? parseInt(item.added, 10) * 1000 : undefined;

                    return {
                        title,
                        magnet: buildMagnet(item.info_hash || '', title),
                        size: formatBytes(sizeBytes),
                        sizeBytes,
                        seeds: parseInt(item.seeders || '0', 10) || 0,
                        leeches: parseInt(item.leechers || '0', 10) || 0,
                        quality: extractQuality(title),
                        source: 'TPB',
                        uploadDate: uploadTimestamp ? new Date(uploadTimestamp).toISOString().split('T')[0] : undefined,
                        uploadTimestamp,
                    };
                });
        } catch {
            // Try next mirror.
        }
    }

    return [];
}

// --- YTS API (movies only, small high-quality encodes) ---

async function searchYTS(query: string, year?: string): Promise<TorrentResult[]> {
    const domains = ['yts.mx', 'yts.am', 'yts.lt', 'yts.do'];

    for (const domain of domains) {
        try {
            const params = new URLSearchParams({ query_term: query, limit: '10', sort_by: 'seeds' });
            const res = await fetch(`https://${domain}/api/v2/list_movies.json?${params}`, {
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) continue;

            const data = await res.json();
            const movies = data?.data?.movies;
            if (!movies || !Array.isArray(movies)) continue;

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
                        uploadTimestamp: torrent.date_uploaded_unix ? parseInt(torrent.date_uploaded_unix, 10) * 1000 : undefined,
                    });
                }
            }

            if (results.length > 0) return results;
        } catch {
            // Try next mirror.
        }
    }

    return [];
}

// --- a.111477.xyz open directory (direct downloads) ---

const OPEN_DIR_BASE = 'https://a.111477.xyz';
const OPEN_DIR_CATEGORIES: Record<string, string[]> = {
    movie: ['/movies/'],
    tv: ['/kdrama/', '/asiandrama/', '/tvs/'],
    all: ['/movies/', '/kdrama/', '/asiandrama/', '/tvs/'],
};

// In-memory cache for directory listings (avoids re-fetching the 7800+ entry index)
const dirCache = new Map<string, { data: { name: string; href: string; sizeBytes: number }[]; ts: number }>();
const DIR_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const SEARCH_CACHE_MAX = 100;

function getSearchCacheKey(title: string, options?: SearchOptions): string {
    return JSON.stringify({
        title: normalizeTitle(title),
        year: options?.year || '',
        type: options?.type || '',
    });
}

function getCachedSearch(key: string): TorrentSearchDiagnostics | null {
    const cached = searchCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.ts > SEARCH_CACHE_TTL) {
        searchCache.delete(key);
        return null;
    }

    return {
        ...cached.data,
        cached: true,
        sources: cached.data.sources.map((source) => ({ ...source, cached: true })),
    };
}

function setCachedSearch(key: string, data: TorrentSearchDiagnostics): void {
    if (searchCache.size >= SEARCH_CACHE_MAX) {
        const oldest = searchCache.keys().next().value as string | undefined;
        if (oldest) searchCache.delete(oldest);
    }

    searchCache.set(key, {
        ts: Date.now(),
        data: {
            ...data,
            cached: false,
            sources: data.sources.map((source) => ({ ...source, cached: false })),
        },
    });
}

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
    const entries = parseDirectoryListing(html);
    dirCache.set(url, { data: entries, ts: Date.now() });
    return entries;
}

/** Normalize a title for fuzzy comparison */
function normalizeTitle(t: string): string {
    return t
        .toLowerCase()
        .replace(/[\(\)\[\]\{\}'"!@#$%^&*,.:;]/g, ' ')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extract entries from the HTML index page (uses data-entry table rows) */
function parseDirectoryListing(html: string): { name: string; href: string; sizeBytes: number }[] {
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

/** Check if folder name matches search query. Ignores episode/resolution tokens for folder matching. */
function titleMatches(folderName: string, query: string, type?: 'movie' | 'tv'): boolean {
    const normalFolder = normalizeTitle(folderName);
    const queryWords = type === 'tv' ? getSignificantTvQueryWords(query) : getSignificantQueryWords(query);
    if (queryWords.length === 0) return true;

    if (type === 'tv' && queryWords.length <= 2) {
        const folderWords = normalFolder.split(' ');
        return queryWords.every((word, index) => folderWords[index] === word);
    }

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
                const matchingFolders = folders.filter(f => titleMatches(f.name, query, type)).slice(0, 5);

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

                if (type && results.length > 0) {
                    return results.slice(0, 50);
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

        const data = await res.json() as KnabenResponse;
        if (!data?.hits || !Array.isArray(data.hits)) return [];

        return data.hits
            .filter((item) => {
                // Filter out adult content and zero-size
                const cat = (item.category || '').toLowerCase();
                if (cat.includes('xxx') || cat.includes('adult') || cat.includes('porn')) return false;
                if (!item.bytes || item.bytes <= 0) return false;
                // Must have at least 1 seeder
                if (!item.seeders || item.seeders < 1) return false;
                return true;
            })
            .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
            .slice(0, 20)
            .map((item) => ({
                title: item.title || 'Unknown',
                magnet: item.magnet || item.magnetUrl || `magnet:?xt=urn:btih:${item.hash || ''}&dn=${encodeURIComponent(item.title || '')}`,
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

        const rowRegex = /<tr class="(?:default|success)">([\s\S]*?)<\/tr>/gi;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const row = rowMatch[1];

            const titleMatch = row.match(/<a href="\/view\/\d+" title="([^"]+)">/i)
                || row.match(/<a href="\/view\/\d+"[^>]*>([^<]+)<\/a>/i);
            const magnetMatch = row.match(/href="(magnet:[^"]+)"/i);
            const sizeMatch = row.match(/<td class="text-center">\s*([\d.]+\s+[KMGTP]?i?B)\s*<\/td>/i);
            const numericCells = Array.from(row.matchAll(/<td class="text-center">\s*(\d+)\s*<\/td>/gi)).map(m => parseInt(m[1], 10));

            if (!titleMatch || !magnetMatch || !sizeMatch || numericCells.length < 2) {
                continue;
            }

            const seeds = numericCells[numericCells.length - 2] || 0;
            const leeches = numericCells[numericCells.length - 1] || 0;
            if (seeds < 1) continue;

            const title = decodeHtmlEntities(titleMatch[1].trim());
            const magnet = decodeHtmlEntities(magnetMatch[1]);
            const size = sizeMatch[1];

            results.push({
                title,
                magnet,
                size,
                sizeBytes: parseSizeToBytes(size),
                seeds,
                leeches,
                quality: extractQuality(title),
                source: 'Nyaa',
            });
        }

        return results.slice(0, 25);
    } catch (e) {
        console.error('Nyaa search error:', e);
        return [];
    }
}

// --- PSArips official feed/pages ---

const PSA_BASES = ['https://psa.wf', 'https://psarips.com'];
const PSA_FEED_CACHE_TTL = 5 * 60 * 1000;
let psaFeedCache: { ts: number; data: PsaFeedItem[] } | null = null;

function parseFeedDate(dateText: string): Pick<TorrentResult, 'uploadDate' | 'uploadTimestamp'> {
    const value = dateText.trim();
    if (!value) return {};

    const now = new Date();
    const lower = value.toLowerCase();
    if (lower === 'today') {
        const timestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return { uploadDate: new Date(timestamp).toISOString().split('T')[0], uploadTimestamp: timestamp };
    }
    if (lower === 'yesterday') {
        const timestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
        return { uploadDate: new Date(timestamp).toISOString().split('T')[0], uploadTimestamp: timestamp };
    }

    const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDate) {
        const [, month, day, year] = slashDate;
        const timestamp = Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        return { uploadDate: new Date(timestamp).toISOString().split('T')[0], uploadTimestamp: timestamp };
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return { uploadDate: value };
    return { uploadDate: new Date(parsed).toISOString().split('T')[0], uploadTimestamp: parsed };
}

async function fetchPsaFeed(): Promise<PsaFeedItem[]> {
    if (psaFeedCache && Date.now() - psaFeedCache.ts < PSA_FEED_CACHE_TTL) {
        return psaFeedCache.data;
    }

    for (const base of PSA_BASES) {
        try {
            const res = await fetch(`${base}/feed/`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) continue;

            const xml = await res.text();
            const items: PsaFeedItem[] = [];
            const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
            let itemMatch;

            while ((itemMatch = itemRegex.exec(xml)) !== null) {
                const itemXml = itemMatch[0];
                const title = decodeHtmlEntities((itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
                    || itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
                    || '').replace(/<[^>]+>/g, '').trim());
                const link = decodeHtmlEntities((itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim());
                const pubDate = decodeHtmlEntities((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim());
                if (!title || !link) continue;

                const parsed = Date.parse(pubDate);
                items.push({
                    title,
                    link: link.replace(/^https?:\/\/psa\.re/i, base),
                    pubDate,
                    timestamp: Number.isNaN(parsed) ? undefined : parsed,
                });
            }

            if (items.length > 0) {
                psaFeedCache = { ts: Date.now(), data: items };
                return items;
            }
        } catch {
            // Try the next active mirror.
        }
    }

    return [];
}

async function searchPsaPosts(query: string, type?: 'movie' | 'tv'): Promise<PsaFeedItem[]> {
    for (const base of PSA_BASES) {
        try {
            const url = `${base}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&subtype=post&per_page=20`;
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) continue;

            const data = await res.json() as Array<{ title?: string; url?: string }>;
            if (!Array.isArray(data)) continue;

            return data
                .map((item) => ({
                    title: decodeHtmlEntities(String(item.title || '').replace(/<[^>]+>/g, '').trim()),
                    link: String(item.url || '').replace(/\\\//g, '/'),
                }))
                .filter((item) => item.title && item.link)
                .filter((item) => !type || (type === 'tv' ? item.link.includes('/tv-show/') : item.link.includes('/movie/')))
                .filter((item) => type === 'tv' ? titleMatches(item.title, query, 'tv') : matchesMovieTitleStrictly(item.title, query));
        } catch {
            // Try the next mirror.
        }
    }

    return [];
}

function psaItemMatchesQuery(item: PsaFeedItem, query: string, type?: 'movie' | 'tv'): boolean {
    if (type === 'tv' && !item.link.includes('/tv-show/')) return false;
    if (type === 'movie' && !item.link.includes('/movie/')) return false;
    return type === 'tv' ? titleMatches(item.title, query, 'tv') : matchesMovieTitleStrictly(item.title, query);
}

async function fetchPsaPageHtml(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return null;
        return res.text();
    } catch {
        return null;
    }
}

function parsePsaReleases(html: string, query: string, type?: 'movie' | 'tv'): PsaRelease[] {
    const releases: PsaRelease[] = [];
    const headMatches = Array.from(html.matchAll(/<div class="sp-head"[^>]*>\s*([\s\S]*?)\s*<\/div>/gi));

    for (let i = 0; i < headMatches.length; i++) {
        const match = headMatches[i];
        const title = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (!/-PSA\b/i.test(title)) continue;

        const bodyStart = (match.index || 0) + match[0].length;
        const bodyEnd = i + 1 < headMatches.length ? headMatches[i + 1].index || bodyStart + 5000 : bodyStart + 5000;
        const body = html.slice(bodyStart, Math.min(bodyEnd, html.length));
        const torrentHref = Array.from(body.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*TORRENT\s*<\/a>/gi))[0]?.[1];
        const sizeText = decodeHtmlEntities(
            body.match(/Size<\/span>\s*:\s*<\/strong>\s*([^<]+)/i)?.[1]?.trim()
            || body.match(/Size<\/span>\s*:\s*([^<]+)/i)?.[1]?.trim()
            || ''
        );

        releases.push({
            title,
            torrentUrl: torrentHref ? decodeHtmlEntities(torrentHref) : undefined,
            size: sizeText || undefined,
            sizeBytes: sizeText ? parseSizeToBytes(sizeText) : 0,
        });
    }

    const episodeQuery = type === 'tv' ? extractEpisodeQuery(query) : null;
    let filtered = releases;

    if (episodeQuery) {
        filtered = filtered.filter((release) => titleMatchesEpisode(release.title, episodeQuery));
    } else if (type === 'tv') {
        const latestEpisode = releases.map((release) => extractEpisodeKey(release.title)).find(Boolean);
        if (latestEpisode) {
            filtered = releases.filter((release) => extractEpisodeKey(release.title) === latestEpisode);
        }
    }

    return filtered.slice(0, 6);
}

function isProbablySameRelease(candidateTitle: string, releaseTitle: string): boolean {
    const candidate = candidateTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const release = releaseTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    return candidate === release || candidate.startsWith(release) || candidate.includes(release);
}

async function resolvePsaReleaseViaIndexers(release: PsaRelease): Promise<TorrentResult | null> {
    const bitsearchExact = await searchBitsearchForPsaRelease(release.title);
    if (bitsearchExact) {
        return {
            ...bitsearchExact,
            title: release.title,
            size: release.size || bitsearchExact.size,
            sizeBytes: release.sizeBytes || bitsearchExact.sizeBytes,
            quality: extractQuality(release.title),
            source: 'PSA',
        };
    }

    const tpbExact = await searchTPBForPsaRelease(release.title);
    if (tpbExact) {
        return {
            ...tpbExact,
            title: release.title,
            size: release.size || tpbExact.size,
            sizeBytes: release.sizeBytes || tpbExact.sizeBytes,
            quality: extractQuality(release.title),
            source: 'PSA',
        };
    }

    const candidates = await searchKnaben(release.title);
    const exact = candidates.find((candidate) => isProbablySameRelease(candidate.title, release.title));
    if (!exact) return null;

    return {
        ...exact,
        title: release.title,
        size: release.size || exact.size,
        sizeBytes: release.sizeBytes || exact.sizeBytes,
        quality: extractQuality(release.title),
        source: 'PSA',
    };
}

async function searchBitsearchForPsaRelease(releaseTitle: string): Promise<TorrentResult | null> {
    try {
        const url = `https://bitsearch.to/search?q=${encodeURIComponent(releaseTitle)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) return null;

        const html = await res.text();
        const magnetMatches = Array.from(html.matchAll(/href="(magnet:[^"]+)"/gi));

        for (const match of magnetMatches) {
            const magnet = decodeHtmlEntities(match[1]);
            const cardStart = html.lastIndexOf('bg-white rounded-lg', match.index || 0);
            const cardEnd = html.indexOf('bg-white rounded-lg', (match.index || 0) + match[0].length);
            const card = html.slice(
                cardStart >= 0 ? cardStart : Math.max(0, (match.index || 0) - 3500),
                cardEnd > 0 ? cardEnd : Math.min(html.length, (match.index || 0) + 2500)
            );

            const title = decodeHtmlEntities(
                card.match(/<a[^>]+href="\/torrent\/[^"]+"[^>]*>\s*([\s\S]*?)\s*<\/a>/i)?.[1]
                    ?.replace(/<[^>]+>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                || releaseTitle
            );

            if (!isProbablySameRelease(title, releaseTitle)) continue;

            const size = decodeHtmlEntities(
                card.match(/<i class="fas fa-download"><\/i>\s*<span>\s*([^<]+)\s*<\/span>/i)?.[1]?.trim()
                || ''
            );
            const uploadDateText = decodeHtmlEntities(
                card.match(/<i class="fas fa-calendar"><\/i>\s*<span>\s*([^<]+)\s*<\/span>/i)?.[1]?.trim()
                || ''
            );
            const seeds = parseInt(card.match(/text-green-600[\s\S]*?<span class="font-medium">\s*(\d+)\s*<\/span>/i)?.[1] || '0', 10) || 0;
            const leeches = parseInt(card.match(/text-red-600[\s\S]*?<span class="font-medium">\s*(\d+)\s*<\/span>/i)?.[1] || '0', 10) || 0;
            const uploadInfo = uploadDateText ? parseFeedDate(uploadDateText) : {};

            return {
                title,
                magnet,
                size: size || 'Unknown',
                sizeBytes: size ? parseSizeToBytes(size) : 0,
                seeds,
                leeches,
                quality: extractQuality(title),
                source: 'PSA',
                ...uploadInfo,
            };
        }
    } catch {
        // Fall through to the other exact-match indexers.
    }

    return null;
}

async function searchTPBForPsaRelease(releaseTitle: string): Promise<TorrentResult | null> {
    for (const base of ['https://apibay.org', 'https://apibay.isohunt.to']) {
        try {
            const url = `${base}/q.php?q=${encodeURIComponent(releaseTitle)}&cat=200`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;

            const data = await res.json() as TPBItem[];
            if (!Array.isArray(data) || data.length === 0 || data[0]?.id === '0') continue;

            const exact = data.find((item) => item.name && item.info_hash && isProbablySameRelease(item.name, releaseTitle));
            if (!exact) continue;

            const title = exact.name || releaseTitle;
            const sizeBytes = parseInt(exact.size || '0', 10) || 0;
            const uploadTimestamp = exact.added ? parseInt(exact.added, 10) * 1000 : undefined;
            return {
                title,
                magnet: buildMagnet(exact.info_hash || '', releaseTitle),
                size: formatBytes(sizeBytes),
                sizeBytes,
                seeds: parseInt(exact.seeders || '0', 10) || 0,
                leeches: parseInt(exact.leechers || '0', 10) || 0,
                quality: extractQuality(releaseTitle),
                source: 'PSA',
                uploadDate: uploadTimestamp ? new Date(uploadTimestamp).toISOString().split('T')[0] : undefined,
                uploadTimestamp,
            };
        } catch {
            // Try next API mirror.
        }
    }

    return null;
}

async function searchOriginalPsa(query: string, options?: { year?: string; type?: 'movie' | 'tv' }): Promise<TorrentResult[]> {
    try {
        const feed = await fetchPsaFeed();
        let pages = feed.filter((item) => psaItemMatchesQuery(item, query, options?.type));

        if (pages.length === 0) {
            pages = await searchPsaPosts(query, options?.type);
        }

        const page = pages
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        if (!page) return [];

        const html = await fetchPsaPageHtml(page.link);
        if (!html) return [];

        const releases = parsePsaReleases(html, query, options?.type);
        if (releases.length === 0) return [];

        const resolved = await Promise.allSettled(
            releases.map((release) => withTimeout(resolvePsaReleaseViaIndexers(release), 8000, null))
        );
        const dateInfo = page.pubDate ? parseFeedDate(page.pubDate) : {};

        return resolved
            .filter((result): result is PromiseFulfilledResult<TorrentResult> => result.status === 'fulfilled' && result.value !== null)
            .map((result) => ({
                ...result.value,
                source: 'PSA',
                uploadDate: result.value.uploadDate || dateInfo.uploadDate,
                uploadTimestamp: result.value.uploadTimestamp || dateInfo.uploadTimestamp,
            }))
            .sort((a, b) => {
                if ((b.uploadTimestamp || 0) !== (a.uploadTimestamp || 0)) {
                    return (b.uploadTimestamp || 0) - (a.uploadTimestamp || 0);
                }
                return b.seeds - a.seeds;
            });
    } catch (e) {
        console.error('PSA search error:', e);
        return [];
    }
}

// --- Combined search ---

export async function searchTorrentsWithDiagnostics(
    title: string,
    options?: SearchOptions
): Promise<TorrentSearchDiagnostics> {
    const started = Date.now();
    const cacheKey = getSearchCacheKey(title, options);
    const cached = getCachedSearch(cacheKey);
    if (cached) {
        console.log(`[TorrentSearch] cache hit for "${title}" — ${cached.results.length} results`);
        return { ...cached, tookMs: Date.now() - started };
    }

    // Use title without appending year directly, as appending year drops many valid tracker results
    const query = title;

    // Always use 200 (All Video) for TPB to ensure we don't filter out HD categories (207, 208)
    const tpbCategory = '200';

    const [psaSource, tpbSource, ytsSource, knabenSource, nyaaSource, ddlSource] = await Promise.all([
        runSource('PSA', 14000, () => searchOriginalPsa(query, options)),
        runSource('TPB', 12000, () => searchTPB(query, tpbCategory)),
        runSource('YTS', 12000, () => options?.type !== 'tv' ? searchYTS(title, options?.year) : Promise.resolve([])),
        runSource('Knaben', 9000, () => searchKnaben(query)),
        runSource('Nyaa', 10000, () => searchNyaa(query)),
        runSource('DDL', 9000, () => searchOpenDirectory(title, options?.type)),
    ]);

    const psaResults = psaSource.results;
    const tpbResults = tpbSource.results;
    const ytsResults = ytsSource.results;
    const knabenResults = knabenSource.results;
    const nyaaResults = nyaaSource.results;
    const ddlResults = ddlSource.results;
    const sources = [psaSource, tpbSource, ytsSource, knabenSource, nyaaSource, ddlSource].map(source => source.status);

    const torrentResults: TorrentResult[] = [
        ...psaResults,
        ...tpbResults,
        ...ytsResults,
        ...knabenResults,
        ...nyaaResults,
    ];

    const sourceStatus = sources.map(source => {
        const suffix = source.status === 'ok' ? '' : ` ${source.status}`;
        return `${source.name}=${source.results}${suffix}/${source.durationMs}ms`;
    });
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
    const relevant = filterByRelevance(unique, title, 25, { year: options?.year, type: options?.type });

    // Apply the same relevance/year filtering to DDL fallback results.
    const relevantDdl = filterByRelevance(ddlResults, title, 15, { year: options?.year, type: options?.type });

    // Deduplicate merged result set.
    const merged = [...relevant, ...relevantDdl];
    const mergedSeen = new Set<string>();
    const finalResults = merged.filter(r => {
        const key = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (mergedSeen.has(key)) return false;
        mergedSeen.add(key);
        return true;
    });

    const diagnostics: TorrentSearchDiagnostics = {
        results: finalResults,
        sources,
        cached: false,
        tookMs: Date.now() - started,
    };

    setCachedSearch(cacheKey, diagnostics);
    return diagnostics;
}

export async function searchTorrents(
    title: string,
    options?: SearchOptions
): Promise<TorrentResult[]> {
    const diagnostics = await searchTorrentsWithDiagnostics(title, options);
    return diagnostics.results;
}
