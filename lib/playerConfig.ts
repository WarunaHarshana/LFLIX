import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const OPTIMIZED_MPV_CONF = `# ==============================================================================
# MPV Configuration - Optimized for LFLIX & Google Drive Cloud Streaming
# ==============================================================================

# === GPU Video Output & Backend ===
vo=gpu-next
gpu-api=d3d11
gpu-context=d3d11
d3d11-output-format=auto

# === Decoding & CPU Multi-threading ===
vd-lavc-threads=0
hwdec=auto-safe

# === Scaling & Performance ===
scale=spline36
cscale=bilinear
dscale=mitchell
correct-downscaling=yes
linear-downscaling=yes
sigmoid-upscaling=yes
dither-depth=auto

# === HDR to SDR Tone Mapping & Vivid Colors ===
target-prim=bt.709
target-trc=srgb
tone-mapping=spline
gamut-mapping-mode=auto
hdr-compute-peak=no

# === Playback & Synchronization ===
save-position-on-quit=yes
keep-open=yes
framedrop=vo
force-window=yes
focus-on=open
autofit-larger=90%x90%
autofit-smaller=30%x30%
cursor-autohide=1000

# === Audio Settings ===
volume=100
volume-max=150
audio-file-auto=exact
audio-pitch-correction=yes

# === Subtitles ===
sub-auto=exact
sub-file-paths=sub:subs:subtitles
sub-font="Segoe UI"
sub-font-size=42
sub-color="#FFFFFFFF"
sub-border-color="#FF000000"
sub-border-size=2.4
sub-shadow-offset=1.2
sub-shadow-color="#33000000"
sub-spacing=0.5
slang=en,eng
alang=ja,jp,jpn,en,eng

# === Screenshots ===
screenshot-format=png
screenshot-high-bit-depth=yes
screenshot-png-compression=7
screenshot-directory="~~desktop/"
screenshot-template="mpv_%F_%P"

# === Fast Open & Cloud Streaming Cache ===
cache=yes
demuxer-max-bytes=300MiB
demuxer-max-back-bytes=100MiB
demuxer-readahead-secs=30
demuxer-seekable-cache=yes
force-seekable=yes
hr-seek=yes
hr-seek-framedrop=yes
demuxer-mkv-probe-start-time=no
demuxer-mkv-subtitle-preroll=no
demuxer-termination-timeout=0.1

# ==============================================================================
# Auto-Profiles for 4K / HEVC files
# ==============================================================================
[4k-hevc]
profile-cond=(width or 0) >= 3840 or get("video-format") == "hevc"
hwdec=no
scale=bilinear
cscale=bilinear
dscale=mitchell
hdr-compute-peak=no
`;

export interface DetectedPlayer {
  type: 'mpv' | 'vlc' | 'potplayer' | 'mpc' | 'generic';
  name: string;
  path: string;
  recommended: boolean;
}

/**
 * Get user configuration file path for MPV.
 */
export function getMpvConfigPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    return path.join(appData, 'mpv', 'mpv.conf');
  }
  const home = process.env.HOME || '/root';
  return path.join(home, '.config', 'mpv', 'mpv.conf');
}

/**
 * Checks whether MPV's config exists and contains LFLIX's cloud streaming optimizations.
 */
export function isMpvConfigOptimized(): boolean {
  const confPath = getMpvConfigPath();
  try {
    if (!fs.existsSync(confPath)) return false;
    const content = fs.readFileSync(confPath, 'utf8');
    return (
      content.includes('demuxer-mkv-probe-start-time=no') &&
      content.includes('demuxer-termination-timeout=0.1')
    );
  } catch {
    return false;
  }
}

/**
 * Writes the optimized mpv.conf to the user's config directory.
 * Also writes to portable_config if a portable MPV install is detected.
 */
export function deployMpvConfig(extraMpvExePath?: string): { success: boolean; path: string; error?: string } {
  try {
    const targetPath = getMpvConfigPath();
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, OPTIMIZED_MPV_CONF, 'utf8');

    // If extra path provided, check if it's a portable install with a portable_config folder
    if (extraMpvExePath && fs.existsSync(extraMpvExePath)) {
      const parentDir = path.dirname(extraMpvExePath);
      const portableDir = path.join(parentDir, 'portable_config');
      if (fs.existsSync(portableDir)) {
        fs.writeFileSync(path.join(portableDir, 'mpv.conf'), OPTIMIZED_MPV_CONF, 'utf8');
      }
    }

    return { success: true, path: targetPath };
  } catch (err: any) {
    return { success: false, path: getMpvConfigPath(), error: err.message };
  }
}

/**
 * Searches system for MPV executable.
 */
export function findMpvExecutable(): string | null {
  // 1. Check PATH
  try {
    const cmd = process.platform === 'win32' ? 'where.exe mpv' : 'which mpv';
    const stdout = execSync(cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim();
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // Prefer .exe over .com on Windows
    const exe = lines.find(l => l.toLowerCase().endsWith('.exe')) || lines[0];
    if (exe && fs.existsSync(exe)) return exe;
  } catch { /* ignore */ }

  if (process.platform === 'win32') {
    // 2. Check WinGet package directories
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetPackages)) {
        try {
          const entries = fs.readdirSync(wingetPackages, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name.toLowerCase().includes('mpv')) {
              const candidate = path.join(wingetPackages, entry.name, 'mpv.exe');
              if (fs.existsSync(candidate)) return candidate;
            }
          }
        } catch { /* ignore */ }
      }

      // WinGet Links
      const wingetLink = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'mpv.exe');
      if (fs.existsSync(wingetLink)) return wingetLink;

      // Local AppData Programs
      const localPrograms = path.join(localAppData, 'Programs', 'mpv', 'mpv.exe');
      if (fs.existsSync(localPrograms)) return localPrograms;
    }

    // 3. Project bundled / bin
    const projectBin = path.join(process.cwd(), 'bin', 'mpv', 'mpv.exe');
    if (fs.existsSync(projectBin)) return projectBin;

    const directBin = path.join(process.cwd(), 'bin', 'mpv.exe');
    if (fs.existsSync(directBin)) return directBin;

    // 4. Common standard Windows install paths
    const standardPaths = [
      'C:\\mpv\\mpv.exe',
      'C:\\Program Files\\mpv\\mpv.exe',
      'C:\\Program Files (x86)\\mpv\\mpv.exe',
      'C:\\Program Files\\mpv.net\\mpvnet.exe',
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

/**
 * Searches system for VLC executable.
 */
export function findVlcExecutable(): string | null {
  const paths = [
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const cmd = process.platform === 'win32' ? 'where.exe vlc' : 'which vlc';
    const stdout = execSync(cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim();
    const first = stdout.split(/\r?\n/)[0]?.trim();
    if (first && fs.existsSync(first)) return first;
  } catch { /* ignore */ }
  return null;
}

/**
 * List all detected media players on the current system, prioritizing MPV.
 */
export function findInstalledPlayers(): DetectedPlayer[] {
  const players: DetectedPlayer[] = [];

  const mpvPath = findMpvExecutable();
  if (mpvPath) {
    players.push({
      type: 'mpv',
      name: 'MPV Player',
      path: mpvPath,
      recommended: true,
    });
  }

  const vlcPath = findVlcExecutable();
  if (vlcPath) {
    players.push({
      type: 'vlc',
      name: 'VLC Media Player',
      path: vlcPath,
      recommended: false,
    });
  }

  // PotPlayer
  const potPaths = [
    'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayer64.exe',
    'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayer.exe',
  ];
  for (const p of potPaths) {
    if (fs.existsSync(p)) {
      players.push({
        type: 'potplayer',
        name: 'PotPlayer',
        path: p,
        recommended: false,
      });
      break;
    }
  }

  // MPC-HC / MPC-BE
  const mpcPaths = [
    'C:\\Program Files\\MPC-HC\\mpc-hc64.exe',
    'C:\\Program Files (x86)\\MPC-HC\\mpc-hc.exe',
    'C:\\Program Files\\MPC-BE\\mpc-be64.exe',
  ];
  for (const p of mpcPaths) {
    if (fs.existsSync(p)) {
      players.push({
        type: 'mpc',
        name: 'Media Player Classic',
        path: p,
        recommended: false,
      });
      break;
    }
  }

  return players;
}

/**
 * Returns the best default player path for this machine.
 * Favors MPV if installed; otherwise VLC; otherwise standard VLC install path.
 */
export function getBestDefaultPlayerPath(): string {
  const mpv = findMpvExecutable();
  if (mpv) return mpv;

  const vlc = findVlcExecutable();
  if (vlc) return vlc;

  return 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
}

/**
 * Sets the default player in the SQLite settings database.
 */
export function setDefaultPlayerInDb(playerPath: string): boolean {
  try {
    const db = require('./db').default || require('./db');
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('vlcPath', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(playerPath);
    return true;
  } catch (e) {
    console.error('Failed to set default player in DB:', e);
    return false;
  }
}
