/**
 * MPV Player Setup & Configuration Script
 *
 * 1. Resolves MPV executable
 * 2. Writes optimized cloud-streaming mpv.conf
 * 3. Updates LFLIX settings database to use MPV as default external player
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getMpvConfigPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    return path.join(appData, 'mpv', 'mpv.conf');
  }
  const home = process.env.HOME || '/root';
  return path.join(home, '.config', 'mpv', 'mpv.conf');
}

function findMpvExecutable() {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe mpv' : 'which mpv';
    const stdout = execSync(cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim();
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const exe = lines.find(l => l.toLowerCase().endsWith('.exe')) || lines[0];
    if (exe && fs.existsSync(exe)) return exe;
  } catch {}

  if (process.platform === 'win32') {
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
        } catch {}
      }

      const wingetLink = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'mpv.exe');
      if (fs.existsSync(wingetLink)) return wingetLink;

      const localPrograms = path.join(localAppData, 'Programs', 'mpv', 'mpv.exe');
      if (fs.existsSync(localPrograms)) return localPrograms;
    }

    const projectBin = path.join(process.cwd(), 'bin', 'mpv', 'mpv.exe');
    if (fs.existsSync(projectBin)) return projectBin;

    const directBin = path.join(process.cwd(), 'bin', 'mpv.exe');
    if (fs.existsSync(directBin)) return directBin;

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

const OPTIMIZED_MPV_CONF = `# ==============================================================================
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

function main() {
  console.log('============================================');
  console.log('  LFLIX - MPV Player Setup & Configuration  ');
  console.log('============================================\n');

  // 1. Locate MPV
  let mpvPath = process.argv[2] || findMpvExecutable();
  if (!mpvPath || !fs.existsSync(mpvPath)) {
    console.error('[MISSING] MPV executable not found.');
    console.error('Please run Setup-MPV.bat or install MPV via winget:');
    console.error('  winget install -e --id mpv-player.mpv\n');
    process.exit(1);
  }

  console.log(`[OK] Found MPV player: ${mpvPath}`);

  // 2. Deploy mpv.conf
  const confPath = getMpvConfigPath();
  const confDir = path.dirname(confPath);
  try {
    if (!fs.existsSync(confDir)) {
      fs.mkdirSync(confDir, { recursive: true });
    }
    fs.writeFileSync(confPath, OPTIMIZED_MPV_CONF, 'utf8');
    console.log(`[OK] Deployed optimized streaming config to:\n     ${confPath}`);

    // If portable config exists, update that too
    const parentDir = path.dirname(mpvPath);
    const portableDir = path.join(parentDir, 'portable_config');
    if (fs.existsSync(portableDir)) {
      fs.writeFileSync(path.join(portableDir, 'mpv.conf'), OPTIMIZED_MPV_CONF, 'utf8');
      console.log(`[OK] Deployed portable config to:\n     ${path.join(portableDir, 'mpv.conf')}`);
    }
  } catch (err) {
    console.error(`[WARNING] Failed to write mpv.conf: ${err.message}`);
  }

  // 3. Update SQLite database settings
  try {
    const Database = require('better-sqlite3');
    const dbPaths = [
      path.join(process.cwd(), 'data', 'lflix.db'),
      path.join(process.cwd(), 'lflix.db'),
      path.join(process.cwd(), 'localflix.db'),
    ];
    let updated = false;
    for (const dbFile of dbPaths) {
      if (fs.existsSync(dbFile)) {
        try {
          const db = new Database(dbFile);
          const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
          if (tableCheck) {
            db.prepare(`
              INSERT INTO settings (key, value) VALUES ('vlcPath', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(mpvPath);
            console.log(`[OK] Updated default player in: ${path.relative(process.cwd(), dbFile)}`);
            updated = true;
          }
          db.close();
        } catch {}
      }
    }

    if (!updated) {
      const targetDb = path.join(process.cwd(), 'data', 'lflix.db');
      const dataDir = path.dirname(targetDb);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const db = new Database(targetDb);
      db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('vlcPath', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(mpvPath);
      db.close();
      console.log(`[OK] Set default player in new database: ${path.relative(process.cwd(), targetDb)}`);
    }
  } catch (err) {
    console.warn(`[INFO] Could not update database directly: ${err.message}`);
  }

  console.log('\n============================================');
  console.log('MPV Setup Complete! LFLIX will now use MPV');
  console.log('with Instant Cloud Streaming & Instant Close.');
  console.log('============================================\n');
}

main();
