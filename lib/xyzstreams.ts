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
 * Parses the EVENTS_DATA array from the homepage HTML.
 */
function parseEventsData(html: string): XyzEvent[] {
  const match = html.match(/const\s+EVENTS_DATA\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  
  try {
    let jsText = match[1];
    // Remove comments safely (not stripping HLS/URL double slashes)
    jsText = jsText.replace(/(?<!:)\/\/.*$/gm, '');
    // Convert single quotes to double quotes for JSON parsing
    jsText = jsText.replace(/'/g, '"');
    // Quote unquoted object keys (ignoring http:// and https://)
    jsText = jsText.replace(/([a-zA-Z0-9_]+)\s*:(?!\/\/)/g, '"$1":');
    // Remove trailing commas
    jsText = jsText.replace(/,\s*\]/g, ']');
    jsText = jsText.replace(/,\s*\}/g, '}');
    
    return JSON.parse(jsText);
  } catch (err) {
    // Regex fallback
    const objRegex = /\{\s*title:\s*"([^"]+)"[\s\S]*?href:\s*"([^"]+)"[\s\S]*?start:\s*"([^"]+)"[\s\S]*?end:\s*"([^"]+)"[\s\S]*?category:\s*"([^"]+)"/g;
    const results: XyzEvent[] = [];
    let m;
    while ((m = objRegex.exec(match[1])) !== null) {
      results.push({
        title: m[1],
        href: m[2],
        start: m[3],
        end: m[4],
        category: m[5]
      });
    }
    return results;
  }
}

/**
 * Parses the streams array from a channel HTML page.
 */
function parseStreamsData(html: string): XyzStream[] {
  const match = html.match(/const\s+streams\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  
  try {
    let jsText = match[1];
    // Remove comments safely (not stripping HLS/URL double slashes)
    jsText = jsText.replace(/(?<!:)\/\/.*$/gm, '');
    // Convert single quotes to double quotes for JSON parsing
    jsText = jsText.replace(/'/g, '"');
    // Quote unquoted object keys (ignoring http:// and https://)
    jsText = jsText.replace(/([a-zA-Z0-9_]+)\s*:(?!\/\/)/g, '"$1":');
    // Remove trailing commas
    jsText = jsText.replace(/,\s*\]/g, ']');
    jsText = jsText.replace(/,\s*\}/g, '}');
    
    return JSON.parse(jsText);
  } catch (err) {
    // Regex fallback
    const objRegex = /\{\s*server:\s*"([^"]+)"[\s\S]*?btnName:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?file:\s*"([^"]+)"/g;
    const results: XyzStream[] = [];
    let m;
    while ((m = objRegex.exec(match[1])) !== null) {
      results.push({
        server: m[1],
        btnName: m[2],
        title: m[3],
        file: m[4]
      });
    }
    return results;
  }
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
