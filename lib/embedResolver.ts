import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Resolves embed.st streams using Chrome DevTools Protocol.
 * Launches headless Chrome, navigates to the embed page, and intercepts
 * the decrypted HLS playlist content via network interception.
 */

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const CDP_PORT = 9227;
const PROFILE_DIR = path.join(os.tmpdir(), 'lflix-embed-resolver');
const RESOLVE_TIMEOUT = 20000; // 20 seconds

let chromeProcess: ChildProcess | null = null;
let chromeReady = false;

function findChrome(): string {
  for (const p of CHROME_PATHS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  throw new Error('Chrome not found. Install Google Chrome to resolve embedded streams.');
}

async function ensureChrome(): Promise<void> {
  if (chromeReady) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return;
    } catch {}
    chromeReady = false;
  }

  // Kill existing process if any
  if (chromeProcess) {
    try { chromeProcess.kill(); } catch {}
    chromeProcess = null;
  }

  const chromePath = findChrome();
  console.log(`[EmbedResolver] Starting Chrome headless: ${chromePath}`);

  chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    `--user-data-dir=${PROFILE_DIR}`,
  ], { stdio: 'ignore' });

  chromeProcess.on('exit', () => {
    chromeReady = false;
    chromeProcess = null;
  });

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        chromeReady = true;
        console.log('[EmbedResolver] Chrome headless ready');
        return;
      }
    } catch {}
  }
  throw new Error('Failed to start Chrome headless');
}

export interface ResolvedStream {
  masterPlaylist: string;
  masterUrl: string;
  qualities: {
    name: string;
    bandwidth: number;
    resolution: string;
    playlistUrl: string;
    playlistContent?: string;
  }[];
}

/**
 * Resolves an embed.st stream to HLS playlist content.
 * Returns the master playlist and quality playlists with their content.
 */
export async function resolveEmbedStream(
  source: string,
  slug: string,
  streamNo: string
): Promise<ResolvedStream> {
  await ensureChrome();

  // Create a new tab
  const newTabRes = await fetch(
    `http://127.0.0.1:${CDP_PORT}/json/new?about:blank`,
    { method: 'PUT' }
  );
  const target = await newTabRes.json();
  const wsUrl = target.webSocketDebuggerUrl;

  return new Promise<ResolvedStream>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending: Record<number, (val: unknown) => void> = {};
    let masterUrl = '';
    let masterPlaylistB64 = '';
    let masterRequestId = '';
    const qualityPlaylists: Record<string, { url: string; requestId: string; content: string }> = {};
    let resolved = false;
    let timeout: ReturnType<typeof setTimeout>;

    const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
      new Promise((res) => {
        const msgId = id++;
        pending[msgId] = res as (val: unknown) => void;
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    const cleanup = async () => {
      clearTimeout(timeout);
      try {
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`, { method: 'PUT' });
      } catch {}
      try { ws.close(); } catch {}
    };

    const tryFinish = async () => {
      if (resolved) return;
      if (!masterPlaylistB64) return;

      // Decode master playlist
      const masterContent = Buffer.from(masterPlaylistB64, 'base64').toString('utf-8');

      // Parse qualities from master playlist
      const qualities: ResolvedStream['qualities'] = [];
      const lines = masterContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const bwMatch = line.match(/BANDWIDTH=(\d+)/);
          const resMatch = line.match(/RESOLUTION=(\S+?)(?:,|$)/);
          const nameMatch = line.match(/NAME="([^"]+)"/);
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !nextLine.startsWith('#')) {
            const qualUrl = nextLine;
            // Build full URL
            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
            const fullUrl = qualUrl.startsWith('http') ? qualUrl : baseUrl + qualUrl;

            qualities.push({
              name: nameMatch?.[1] || qualUrl,
              bandwidth: parseInt(bwMatch?.[1] || '0'),
              resolution: resMatch?.[1] || '',
              playlistUrl: fullUrl,
              playlistContent: qualityPlaylists[fullUrl]?.content,
            });
          }
        }
      }

      // Check if we have all quality playlists
      const allQualitiesResolved = qualities.every(q => q.playlistContent);

      if (allQualitiesResolved || Date.now() - startTime > RESOLVE_TIMEOUT - 2000) {
        resolved = true;
        await cleanup();
        resolve({
          masterPlaylist: masterContent,
          masterUrl,
          qualities,
        });
      }
    };

    const startTime = Date.now();

    ws.onmessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);

      if (msg.id && pending[msg.id]) {
        pending[msg.id](msg.result || msg);
        delete pending[msg.id];
      }

      // Capture network requests
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params.request.url as string;
        if (url.includes('playlist.m3u8') && !masterUrl) {
          masterUrl = url;
          masterRequestId = msg.params.requestId;
          console.log(`[EmbedResolver] Found master playlist: ${url}`);
        } else if (url.includes('/mono.m3u8')) {
          qualityPlaylists[url] = {
            url,
            requestId: msg.params.requestId,
            content: '',
          };
          console.log(`[EmbedResolver] Found quality playlist: ${url}`);
        }
      }

      // Capture response bodies when loading completes
      if (msg.method === 'Network.loadingFinished') {
        const reqId = msg.params.requestId;

        if (reqId === masterRequestId && !masterPlaylistB64) {
          try {
            const body = await send('Network.getResponseBody', { requestId: reqId }) as { body: string };
            masterPlaylistB64 = body.body;
            console.log('[EmbedResolver] Got master playlist content');
            await tryFinish();
          } catch (e) {
            console.error('[EmbedResolver] Failed to get master body:', e);
          }
        }

        // Check quality playlists
        for (const [url, qp] of Object.entries(qualityPlaylists)) {
          if (reqId === qp.requestId && !qp.content) {
            try {
              const body = await send('Network.getResponseBody', { requestId: reqId }) as { body: string };
              const decoded = Buffer.from(body.body, 'base64').toString('utf-8');
              qp.content = decoded;
              console.log(`[EmbedResolver] Got quality playlist: ${url.split('/').slice(-2).join('/')}`);
              await tryFinish();
            } catch (e) {
              console.error('[EmbedResolver] Failed to get quality body:', e);
            }
          }
        }
      }
    };

    ws.onerror = () => {
      cleanup().then(() => reject(new Error('WebSocket error during stream resolution')));
    };

    ws.onopen = async () => {
      try {
        await send('Network.enable');
        await send('Page.enable');

        const embedUrl = `https://embed.st/embed/${source}/${slug}/${streamNo}`;
        console.log(`[EmbedResolver] Navigating to: ${embedUrl}`);
        await send('Page.navigate', { url: embedUrl });

        timeout = setTimeout(async () => {
          if (!resolved) {
            // Try to finish with what we have
            if (masterPlaylistB64) {
              await tryFinish();
            }
            if (!resolved) {
              await cleanup();
              reject(new Error('Timeout resolving embed stream'));
            }
          }
        }, RESOLVE_TIMEOUT);
      } catch (err) {
        await cleanup();
        reject(err);
      }
    };
  });
}

/**
 * Shutdown Chrome headless process
 */
export function shutdownResolver() {
  if (chromeProcess) {
    try { chromeProcess.kill(); } catch {}
    chromeProcess = null;
    chromeReady = false;
  }
}
