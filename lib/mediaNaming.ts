import path from 'path';

/**
 * Pure filename/path heuristics used to classify media during library scans.
 *
 * Extracted from lib/scanner.ts so they can be exercised without opening the
 * database or reaching TMDB — these regexes decide what ends up in the library,
 * so they are the part most worth testing directly.
 */

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'];

// TV show detection patterns, tried in order. The bare-episode pattern is last
// so "S01E02" and "1x02" win over a stray "E02".
const TV_PATTERNS = [
  /(.+?)[ .\[\(]?(?:s(\d+)[ .]?e(\d+))/i,
  /(.+?)[ .\[\(]?(?:(\d+)x(\d+))/i,
  /(.+?)[ ._-]?(?:season[ ._]?(\d+)[ ._]?episode[ ._]?(\d+))/i,
  /(.+?)[ .\[\(]?(?:ep?(\d+))/i,
];

const HDR_PATTERN = /\b(HDR10\+?|HDR10Plus|HDR|HLG|DV|DoVi|Dolby[. ]?Vision|DolbyVision)\b/i;

// Folders that contain bonus/extras content which should not appear in the main library
export const EXTRAS_FOLDER_NAMES = new Set([
  'extras', 'extra', 'bonus', 'bonus features', 'bonus content',
  'featurettes', 'featurette', 'behind the scenes', 'behind-the-scenes',
  'deleted scenes', 'deleted-scenes', 'deleted scene',
  'special features', 'specials',
  'interviews', 'bloopers', 'gag reel', 'outtakes',
  'making of', 'making-of', 'the making of',
  'commentary', 'commentaries',
  'shorts', 'promos', 'trailers', 'trailer',
]);

export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isSampleClip(filePath: string): boolean {
  const parts = filePath.split(/[\\/]+/).map(part => part.toLowerCase());
  const parentDirs = parts.slice(0, -1);
  if (parentDirs.some(part => part === 'sample' || part === 'samples')) return true;

  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
  return /(^|[._ -])sample([._ -]|$)/.test(baseName);
}

export function isExtrasContent(filePath: string): boolean {
  const parts = filePath.split(/[\\/]+/).map(part => part.toLowerCase().trim());
  const parentDirs = parts.slice(0, -1);
  return parentDirs.some(dir => EXTRAS_FOLDER_NAMES.has(dir));
}

export function isExtrasFolderName(name: string): boolean {
  return EXTRAS_FOLDER_NAMES.has(name.toLowerCase().trim());
}

export function detectTvShow(fileName: string): { name: string; season: number; episode: number } | null {
  for (const pattern of TV_PATTERNS) {
    const match = fileName.match(pattern);
    if (match) {
      const name = match[1].replace(/[._]/g, ' ').trim();
      const season = parseInt(match[2]) || 1;
      const episode = parseInt(match[3]) || parseInt(match[2]) || 1;
      if (episode > 0) {
        return { name, season, episode };
      }
    }
  }
  return null;
}

export function detectHDR(fileName: string): boolean {
  return HDR_PATTERN.test(fileName);
}

export function detectResolution(fileName: string): string | null {
  if (/\b(2160p|4k|UHD)\b/i.test(fileName)) return '2160p';
  if (/\b1080p\b/i.test(fileName)) return '1080p';
  if (/\b720p\b/i.test(fileName)) return '720p';
  if (/\b480p\b/i.test(fileName)) return '480p';
  return null;
}

export function detectVideoCodec(fileName: string): string | null {
  if (/\b(x265|h\.?265|HEVC)\b/i.test(fileName)) return 'HEVC';
  if (/\b(x264|h\.?264|AVC)\b/i.test(fileName)) return 'H.264';
  if (/\bAV1\b/i.test(fileName)) return 'AV1';
  if (/\bVP9\b/i.test(fileName)) return 'VP9';
  return null;
}

export function detectAudioCodec(fileName: string): { codec: string | null; channels: string | null } {
  let codec: string | null = null;
  let channels: string | null = null;

  if (/\bAtmos\b/i.test(fileName)) codec = 'Atmos';
  else if (/\bTrueHD\b/i.test(fileName)) codec = 'TrueHD';
  else if (/\bDTS[- ]?HD\b/i.test(fileName)) codec = 'DTS-HD';
  else if (/\bDTS\b/i.test(fileName)) codec = 'DTS';
  // No trailing \b after DDP/DD+: releases overwhelmingly write the channel
  // layout straight after the codec ("DDP5.1", "DD+7.1"), and a word boundary
  // cannot sit between "P" and "5".
  else if (/\bE-?AC-?3\b/i.test(fileName) || /\bDD\+/i.test(fileName) || /\bDDP/i.test(fileName)) codec = 'EAC3';
  else if (/\bAC3\b/i.test(fileName) || /\bDD\d\.?\d\b/i.test(fileName)) codec = 'AC3';
  else if (/\bAAC\b/i.test(fileName)) codec = 'AAC';
  else if (/\bFLAC\b/i.test(fileName)) codec = 'FLAC';
  else if (/\bOpus\b/i.test(fileName)) codec = 'Opus';

  if (/\b7\.1\b/.test(fileName)) channels = '7.1';
  else if (/\b5\.1\b/.test(fileName)) channels = '5.1';
  else if (/\b2\.0\b/.test(fileName)) channels = '2.0';

  return { codec, channels };
}
