/**
 * xyzstreams.st API integration for live sports events.
 * Scrapes the homepage schedule and individual channel stream lists.
 */

const XYZ_BASE = 'https://xyzstreams.st';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type XyzEvent = {
  title: string;
  href: string;
  start: string;
  end: string;
  category: string;
  bg?: string;
};

export type XyzStream = {
  server: string;
  btnName: string;
  title: string;
  type?: string;
  file: string;
  requiresClappr?: boolean;
  requiresOPlayer?: boolean;
  embedUrl?: string;
  isDown?: boolean;
};

/**
 * Extracts a JavaScript/JSON array assigned to a variable name using balanced bracket parsing.
 */
export function extractJsonArray(html: string, varName: string): any[] {
  const markerRegex = new RegExp(`(?:const|let|var)?\\s*${varName}\\s*=\\s*\\[`);
  const match = html.match(markerRegex);
  if (!match || match.index === undefined) return [];

  const arrayStart = html.indexOf('[', match.index);
  if (arrayStart === -1) return [];

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escape = false;

  for (let i = arrayStart; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        const raw = html.substring(arrayStart, i + 1);
        try {
          return JSON.parse(raw);
        } catch {
          try {
            return (new Function(`return ${raw}`))();
          } catch {
            return [];
          }
        }
      }
    }
  }
  return [];
}

/**
 * Parses the EVENTS_DATA array from the homepage HTML.
 */
export function parseEventsData(html: string): XyzEvent[] {
  const events = extractJsonArray(html, 'EVENTS_DATA');
  if (events && Array.isArray(events) && events.length > 0) {
    return events;
  }

  // Regex fallback
  const objRegex = /\{\s*["']?title["']?\s*:\s*["']([^"']+)["'][\s\S]*?["']?href["']?\s*:\s*["']([^"']+)["'][\s\S]*?["']?start["']?\s*:\s*["']([^"']+)["'][\s\S]*?["']?end["']?\s*:\s*["']([^"']+)["'][\s\S]*?["']?category["']?\s*:\s*["']([^"']*)["']/g;
  const results: XyzEvent[] = [];
  let m;
  while ((m = objRegex.exec(html)) !== null) {
    results.push({
      title: m[1],
      href: m[2],
      start: m[3],
      end: m[4],
      category: m[5] || ''
    });
  }
  return results;
}

/**
 * Parses streams from a channel HTML page, supporting both embedded scripts,
 * modern iframe player targets, and stream selector buttons.
 */
export function parseStreamsData(html: string): XyzStream[] {
  // 1. Try script array 'streams'
  const scriptStreams = extractJsonArray(html, 'streams');
  if (scriptStreams && Array.isArray(scriptStreams) && scriptStreams.length > 0) {
    return scriptStreams;
  }

  const detectedStreams: XyzStream[] = [];
  const seenUrls = new Set<string>();

  // 2. Look for stream switcher buttons with data-url: <button class="...stream-btn..." data-url="...">
  const btnRegex = /<[^>]+class=["'][^"']*stream-btn[^"']*["'][^>]*data-url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let btnMatch;
  let serverIdx = 1;
  while ((btnMatch = btnRegex.exec(html)) !== null) {
    const streamUrl = btnMatch[1].trim();
    const btnLabel = btnMatch[2].replace(/<[^>]+>/g, '').trim();
    if (streamUrl && !seenUrls.has(streamUrl)) {
      seenUrls.add(streamUrl);
      detectedStreams.push({
        server: `Server ${serverIdx++}`,
        btnName: btnLabel || `Stream ${detectedStreams.length + 1}`,
        title: btnLabel || `Stream ${detectedStreams.length + 1}`,
        file: streamUrl,
        embedUrl: streamUrl
      });
    }
  }

  // 3. Look for default stream-player iframe: <iframe ... id="stream-player" ... src="...">
  const playerIframeMatch = html.match(/<iframe[^>]+id=["']stream-player["'][^>]+src=["']([^"']+)["']/i) ||
                            html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]+id=["']stream-player["']/i);
  if (playerIframeMatch) {
    const mainEmbedUrl = playerIframeMatch[1].trim();
    if (mainEmbedUrl && !seenUrls.has(mainEmbedUrl)) {
      seenUrls.add(mainEmbedUrl);
      detectedStreams.unshift({
        server: 'Primary Server',
        btnName: 'Main Stream',
        title: 'Main Stream',
        file: mainEmbedUrl,
        embedUrl: mainEmbedUrl
      });
    }
  }

  // 4. Fallback: look for any iframe with embed or player src
  if (detectedStreams.length === 0) {
    const anyIframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let ifm;
    while ((ifm = anyIframeRegex.exec(html)) !== null) {
      const src = ifm[1].trim();
      if ((src.includes('embed') || src.includes('player') || src.includes('stream') || src.endsWith('.m3u8')) && !seenUrls.has(src)) {
        seenUrls.add(src);
        detectedStreams.push({
          server: `Server ${detectedStreams.length + 1}`,
          btnName: `Stream ${detectedStreams.length + 1}`,
          title: `Stream ${detectedStreams.length + 1}`,
          file: src,
          embedUrl: src
        });
      }
    }
  }

  return detectedStreams;
}

/**
 * Fetch all scheduled events from xyzstreams.st.
 */
export async function fetchXyzEvents(): Promise<XyzEvent[]> {
  try {
    const res = await fetch(`${XYZ_BASE}/`, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': USER_AGENT
      },
      next: { revalidate: 60 } as any
    });
    
    if (!res.ok) {
      console.error(`xyzstreams: Homepage returned status ${res.status}`);
      return [];
    }
    
    const html = await res.text();
    return parseEventsData(html);
  } catch (err) {
    console.error('xyzstreams: Failed to fetch events:', err);
    return [];
  }
}

/**
 * Fetch all streams for a specific channel (e.g. wc-1.html).
 */
export async function fetchXyzStreams(href: string): Promise<any[]> {
  if (!href) return [];
  
  try {
    // Normalize url
    const url = href.startsWith('http') 
      ? href 
      : `${XYZ_BASE}/${href.startsWith('/') ? href.slice(1) : href}`;
      
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'Referer': `${XYZ_BASE}/`,
        'User-Agent': USER_AGENT
      },
      next: { revalidate: 30 } as any
    });
    
    if (!res.ok) {
      console.error(`xyzstreams: Channel page ${href} returned status ${res.status}`);
      return [];
    }
    
    const html = await res.text();
    const rawStreams = parseStreamsData(html);
    
    return rawStreams.map((s, index) => {
      const label = (s.btnName || s.title || '').toUpperCase();
      // Match 4K, UHD, 4к (cyrillic), FHD, HD
      const is4k = label.includes('4K') || label.includes('UHD') || label.includes('4К');
      const isHd = is4k || label.includes('HD') || label.includes('FHD') || label.includes('1080P') || label.includes('720P');
      
      // If embedUrl exists, use it. Otherwise use the direct HLS stream link (s.file).
      let finalEmbedUrl = s.embedUrl || s.file;
      if (finalEmbedUrl && finalEmbedUrl.endsWith('.html') && finalEmbedUrl.includes('-embed')) {
        finalEmbedUrl = finalEmbedUrl.replace(/\.html$/, '');
      }
      
      return {
        id: `xyz-${href}-${index}`,
        streamNo: index + 1,
        language: `${s.btnName || s.title} [${s.server || 'Server 1'}]`,
        hd: isHd,
        is4k: is4k,
        embedUrl: finalEmbedUrl,
        source: 'xyzstreams'
      };
    });
  } catch (err) {
    console.error(`xyzstreams: Failed to fetch streams for ${href}:`, err);
    return [];
  }
}
