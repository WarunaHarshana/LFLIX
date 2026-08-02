# Changelog

## v0.7.0

Security, correctness and a first test suite. **Everyone is signed out once on
upgrade** — the session format changed. Sign in with the same PIN.

### Security

- **`/api/browse` no longer exposes the filesystem.** It was unauthenticated so
  the first-run wizard could use it, but nothing revoked that afterwards —
  anyone who could reach the port could enumerate every drive, folder and file
  on the host. It is now open only until setup completes.
- **`POST /api/setup` can no longer reset the PIN.** It accepted a new PIN from
  any caller and rewrote `APP_PIN` in `.env.local`, taking over the instance on
  the next restart.
- **The player path can no longer be pointed at any executable.** `/api/play`
  spawns whatever `/api/settings` stored, and validation only *warned* if the
  filename lacked "vlc". Both ends now enforce an allowlist of real players, so
  a settings write cannot become arbitrary code execution.
- **Sessions are signed instead of storing the PIN.** The auth cookie contained
  the PIN in plain text, compared with `!==`. It now carries an HMAC-signed,
  expiring value; comparisons are constant-time. The signing key derives from
  `APP_PIN`, so changing the PIN invalidates every outstanding session.
- **Removed the `1234` fallback PIN**, which the login screen also advertised on
  screen. An install without `APP_PIN` now refuses to authenticate.
- **Removed a hardcoded TMDB API key** from the source. Keys now come from
  settings or `TMDB_API_KEY`.
- Patched `next` (HTTP request smuggling), `sharp` and `postcss`; dropped the
  unused, unmaintained `dlnacasts`; moved `@capacitor/cli` out of runtime
  dependencies. Production audit: 23 vulnerabilities (1 critical) → 12 (0
  critical).

### Fixed

- **Home page could white-screen.** `ContinueWatching` returned before its hooks
  ran, so React threw once the continue-watching list went from empty to
  populated. `VideoPlayer` had the same defect.
- **IPTV wrote to the wrong database.** Channel import, listing and clearing each
  opened their own handle on a stray `localflix.db` with a reduced schema, while
  the rest of the app used `data/lflix.db`. That file was also a hazard: losing
  the real database would have promoted an IPTV-only file in its place.
- **`DDP5.1` audio was detected as no codec at all.** One of the most common
  Dolby Digital Plus namings matched nothing, so those files showed no audio
  badge.
- Video streams no longer crash the server when a client seeks away mid-transfer.
- Stream tokens survive a restart, so casting to a TV no longer dies when the
  server reloads.
- SQLite now checkpoints its write-ahead log on shutdown instead of growing
  unbounded.

### Performance

- **Hardware-accelerated encoding**, selected by actually initialising the
  encoder rather than trusting `ffmpeg -encoders`, with a `libx264` fallback.
  Set `LFLIX_FORCE_SOFTWARE_ENCODER=1` to opt out.
- **Player buffering retuned for LAN** rather than public-CDN defaults: buffers
  further ahead to give the on-demand transcoder a runway, and treats a slow
  segment as work in progress instead of a network failure.
- Library scanning fetches metadata for unrelated titles in parallel instead of
  strictly one at a time.
- The library query no longer sends every column of every row on each page load.

### Added

- **First test suite in the project** — 195 tests covering filename parsing,
  torrent matching, the path/URL/player validators, cache behaviour, session
  signing and the full auth matrix. Wired into `npm run verify` and CI.
- `docs/streaming-performance.md` — how Netflix, Apple and Prime Video approach
  delivery, measured against what LFLIX does, with a ranked list of what is
  worth copying and what is not.
- `role="dialog"`, `aria-modal` and a written label on all 19 modals; every
  icon-only button now has an accessible name.
- Documented environment variables and a `.env.example`.

### Known limitations

- Transcoding 4K HEVC can run slower than realtime on CPU-only machines. See
  `docs/streaming-performance.md`; a working GPU driver is the practical fix.
- A remux ("Direct Stream") tier is designed but not yet implemented, so MKVs
  containing already-playable video are still fully re-encoded. This is the
  largest remaining performance gap — measured at 18× on a real 4K file.
