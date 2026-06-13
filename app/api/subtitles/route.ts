import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { findFFmpeg, findFFprobe, resolveMediaFromParams, forwardAuthParams } from '@/lib/ffmpeg';
import { getSafeErrorMessage } from '@/lib/security';

// Subtitle resolution for the web player.
//   ?list=1            -> JSON list of available subtitle tracks (external files + embedded)
//   ?sub=ext&idx=<n>   -> serve external subtitle file #n as WebVTT
//   ?sub=emb&idx=<n>   -> extract & serve embedded subtitle stream #n as WebVTT
//   ?path=<file>       -> legacy: serve the first matching English sidecar file
// Media is resolved from contentType/contentId(/episodeId) or a token (see lib/ffmpeg).

export const dynamic = 'force-dynamic';

const SUB_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.flv', '.wmv'];

function hasMultipleVideos(dir: string): boolean {
  try {
    const files = fs.readdirSync(dir);
    let videoCount = 0;
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (VIDEO_EXTENSIONS.includes(ext)) {
        videoCount++;
        if (videoCount > 1) return true;
      }
    }
  } catch {}
  return false;
}

const LANG_LABELS: Record<string, string> = {
  en: 'English', eng: 'English',
  es: 'Spanish', spa: 'Spanish',
  fr: 'French', fre: 'French', fra: 'French',
  de: 'German', ger: 'German', deu: 'German',
  it: 'Italian', ita: 'Italian',
  pt: 'Portuguese', por: 'Portuguese',
  ru: 'Russian', rus: 'Russian',
  ja: 'Japanese', jpn: 'Japanese',
  ko: 'Korean', kor: 'Korean',
  zh: 'Chinese', chi: 'Chinese', zho: 'Chinese',
  hi: 'Hindi', hin: 'Hindi',
  ar: 'Arabic', ara: 'Arabic',
  ta: 'Tamil', tam: 'Tamil',
  si: 'Sinhala', sin: 'Sinhala',
  nl: 'Dutch', dut: 'Dutch', nld: 'Dutch',
  pl: 'Polish', pol: 'Polish',
  tr: 'Turkish', tur: 'Turkish',
};

function langLabel(code?: string | null): string {
  if (!code) return '';
  const c = code.toLowerCase();
  return LANG_LABELS[c] || code.toUpperCase();
}

function srtToVtt(srt: string): string {
  let vtt = 'WEBVTT\n\n';
  const lines = srt.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    vtt += (line.includes('-->') ? line.replace(/,/g, '.') : line) + '\n';
  }
  return vtt;
}

// Convert any subtitle file (.ass/.ssa/.sub/...) to WebVTT via ffmpeg.
function convertFileToVtt(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      findFFmpeg(),
      ['-v', 'error', '-i', filePath, '-f', 'webvtt', 'pipe:1'],
      { timeout: 30000, maxBuffer: 25 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

type ExternalSub = { file: string; lang: string; label: string; ext: string };

// Find sidecar subtitle files next to the video (and in common subs/ folders).
function findExternalSubs(videoPath: string): ExternalSub[] {
  const dir = path.dirname(videoPath);
  const ext = path.extname(videoPath);
  const base = path.basename(videoPath, ext).toLowerCase();

  const searchDirs = [dir];
  for (const sub of ['subs', 'Subs', 'subtitles', 'Subtitles']) {
    const p = path.join(dir, sub);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) searchDirs.push(p);
    } catch { /* ignore */ }
  }

  const found: ExternalSub[] = [];
  const seen = new Set<string>();
  const multiVideos = hasMultipleVideos(dir);

  for (const d of searchDirs) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(d);
    } catch { continue; }

    for (const name of entries) {
      const e = path.extname(name).toLowerCase();
      if (!SUB_EXTENSIONS.includes(e)) continue;
      const lower = name.toLowerCase();
      
      const isSidecar = lower.startsWith(base);
      const inSubsFolder = d !== dir;
      
      // If there are multiple video files in the directory, subtitle files inside the subs/ folder
      // must start with the video base name to be matched.
      if (multiVideos) {
        if (!isSidecar) continue;
      } else {
        if (!isSidecar && !inSubsFolder) continue;
      }

      const full = path.join(d, name);
      if (seen.has(full)) continue;
      seen.add(full);

      // Derive a language code from the filename, e.g. Movie.en.srt / Movie.eng.srt / Movie_English.srt
      const stem = path.basename(lower, e);
      const parts = stem.split('.');
      let lang = '';
      const last = parts[parts.length - 1];
      if (last && last !== base && last.length <= 5 && /^[a-z]+$/.test(last)) {
        lang = last;
      } else {
        // Look for language names or codes bounded by non-alphabetic characters.
        // e.g. "Movie_English.srt" or "Movie-es.srt" or "2_eng.srt"
        const tokens = stem.split(/[^a-z0-9]/);
        for (const tok of tokens) {
          if (LANG_LABELS[tok]) {
            lang = tok;
            break;
          }
          const matchedCode = Object.keys(LANG_LABELS).find(
            (k) => LANG_LABELS[k].toLowerCase() === tok
          );
          if (matchedCode) {
            lang = matchedCode;
            break;
          }
        }
      }

      found.push({
        file: full,
        lang,
        label: (langLabel(lang) || 'Subtitle') + ` (${e.slice(1).toUpperCase()})`,
        ext: e,
      });
    }
  }
  return found;
}

type EmbeddedSub = { streamIndex: number; lang: string; label: string };

// Probe the container for embedded subtitle streams.
function findEmbeddedSubs(videoPath: string): Promise<EmbeddedSub[]> {
  return new Promise((resolve) => {
    execFile(
      findFFprobe(),
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-select_streams', 's', videoPath],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const streams = data.streams || [];
          const subs: EmbeddedSub[] = streams.map((s: any, i: number) => {
            const lang = s.tags?.language || '';
            const title = s.tags?.title || '';
            const label = title || langLabel(lang) || `Embedded ${i + 1}`;
            return { streamIndex: i, lang, label: `${label} (embedded)` };
          });
          resolve(subs);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

type AudioTrackInfo = { index: number; label: string; language: string };

function findAudioTracks(videoPath: string): Promise<AudioTrackInfo[]> {
  return new Promise((resolve) => {
    execFile(
      findFFprobe(),
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-select_streams', 'a', videoPath],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const streams = data.streams || [];
          const tracks: AudioTrackInfo[] = streams.map((s: any, i: number) => {
            const lang = s.tags?.language || '';
            const title = s.tags?.title || '';
            const codec = s.codec_name || '';
            const label = title || langLabel(lang) || `Track ${i + 1}`;
            return {
              index: i,
              language: lang,
              label: `${label} (${codec.toUpperCase()})`,
            };
          });
          resolve(tracks);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

function extractEmbeddedVtt(videoPath: string, subStreamIndex: number): Promise<string | null> {
  return new Promise((resolve) => {
    const ff = spawn(findFFmpeg(), [
      '-v', 'error',
      '-i', videoPath,
      '-map', `0:s:${subStreamIndex}`,
      '-f', 'webvtt',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    let errored = false;
    ff.stdout.on('data', (d) => { out += d.toString(); });
    ff.on('error', () => { errored = true; resolve(null); });
    ff.on('close', (code) => {
      if (errored) return;
      resolve(code === 0 && out ? out : null);
    });
  });
}

function vttResponse(content: string) {
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Resolve the source video path: prefer id/token resolution, fall back to legacy ?path=.
    let videoPath: string | null = null;
    const resolved = resolveMediaFromParams(searchParams);
    if (resolved.ok) {
      videoPath = resolved.mediaPath;
    } else {
      if (resolved.status === 401) {
        return new NextResponse(resolved.error, { status: 401 });
      }
      const legacy = searchParams.get('path');
      if (legacy && fs.existsSync(legacy)) videoPath = legacy;
    }

    if (!videoPath) {
      return new NextResponse('Video not found', { status: 404 });
    }

    const authQuery = forwardAuthParams(searchParams);
    const hasAuthQuery = authQuery.length > 0;
    const pathQuery = `path=${encodeURIComponent(videoPath)}`;
    const baseQuery = hasAuthQuery ? authQuery : pathQuery;

    // --- List mode: enumerate available subtitle tracks ---
    if (searchParams.get('list')) {
      const external = findExternalSubs(videoPath);
      const embedded = await findEmbeddedSubs(videoPath);
      const audioTracks = await findAudioTracks(videoPath);

      const tracks = [
        ...external.map((s, i) => ({
          label: s.label,
          language: s.lang || 'und',
          url: `/api/subtitles?${baseQuery}&sub=ext&idx=${i}`,
        })),
        ...embedded.map((s) => ({
          label: s.label,
          language: s.lang || 'und',
          url: `/api/subtitles?${baseQuery}&sub=emb&idx=${s.streamIndex}`,
        })),
      ];

      return NextResponse.json(
        { tracks, audioTracks },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      );
    }

    const subType = searchParams.get('sub');
    const idx = parseInt(searchParams.get('idx') || '', 10);

    // --- Serve an external sidecar subtitle ---
    if (subType === 'ext') {
      const external = findExternalSubs(videoPath);
      if (!Number.isInteger(idx) || idx < 0 || idx >= external.length) {
        return new NextResponse('Subtitle not found', { status: 404 });
      }
      const chosen = external[idx];
      if (chosen.ext === '.vtt') {
        return vttResponse(fs.readFileSync(chosen.file, 'utf8'));
      }
      if (chosen.ext === '.srt') {
        return vttResponse(srtToVtt(fs.readFileSync(chosen.file, 'utf8')));
      }
      const converted = await convertFileToVtt(chosen.file);
      if (!converted) return new NextResponse('Could not convert subtitle', { status: 500 });
      return vttResponse(converted);
    }

    // --- Serve an embedded subtitle stream ---
    if (subType === 'emb') {
      if (!Number.isInteger(idx) || idx < 0) {
        return new NextResponse('Invalid subtitle index', { status: 400 });
      }
      const vtt = await extractEmbeddedVtt(videoPath, idx);
      if (!vtt) return new NextResponse('Could not extract embedded subtitle', { status: 500 });
      return vttResponse(vtt);
    }

    // --- Legacy behaviour: first English sidecar next to the file ---
    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const base = path.basename(videoPath, ext);
    const possiblePaths = [
      path.join(dir, base + '.srt'),
      path.join(dir, base + '.en.srt'),
      path.join(dir, base + '.eng.srt'),
      path.join(dir, 'subs', base + '.srt'),
    ];
    const finalPath = possiblePaths.find((p) => fs.existsSync(p));
    if (!finalPath) {
      return new NextResponse('No subtitles found', { status: 404 });
    }
    return vttResponse(srtToVtt(fs.readFileSync(finalPath, 'utf8')));
  } catch (error) {
    console.error('Subtitle Error:', error);
    return new NextResponse(getSafeErrorMessage(error), { status: 500 });
  }
}
