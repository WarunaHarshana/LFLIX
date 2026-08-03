# Changelog

## v0.7.1

Fixes for four problems found while using v0.7.0.

### Fixed

- **Cards and hero banners never loaded, and the first launch of the day
  crawled.** Artwork was routed through Next's image optimizer at quality 80
  (cards) and 90 (banners), but Next 16 only permits qualities listed in
  `images.qualities`, which defaults to `[75]` — so the optimizer answered both
  with HTTP 400 and everything fell back to placeholders. Optimizing was wasted
  work anyway: TMDB already serves a correctly sized variant, so the server was
  re-encoding artwork that was already right, at roughly 2.3s per cold poster.
  Now served straight from TMDB — 483 ms cold, 237 ms warm.
- **"404 This page could not be found" on most launches.** Closing the window
  with the X button leaves the server running and holding port 3000; the next
  launch quietly moved to 3001 while the browser still opened 3000, landing on
  the orphan. The launcher now clears a stale server first (only ever
  terminating `node.exe`) and waits for a real success response instead of
  treating a 404 as ready. Stop the server with **Ctrl+C** rather than the X to
  avoid the orphan entirely.
- **Appearance settings did nothing.** The theme tokens were sound but almost
  nothing consumed them — around 1400 hardcoded colour classes against 60 token
  references — so switching Base Theme changed variables that ~4% of the UI
  painted with. Tailwind's neutral scale now resolves through the theme tokens,
  making the whole app theme-aware. Accent follows the brand shades only; error
  and failure colours stay red whichever accent is chosen.
- **The session was discarded on every reload**, so a refresh demanded the PIN
  again despite a valid 7-day cookie. Nothing checked for an existing session on
  load, and `GET /api/auth/login` could not be used for it because that path is
  public and always reported success.

### Accessibility

- `Escape` now closes modals — it was advertised in the shortcuts overlay but
  wired into only 2 of 15. Opening a modal also locks background scrolling.
- Focus traps on the eight dialog-style modals: focus moves to the first control
  on open and returns to whatever opened it on close.

### Performance

- Downloads polling no longer runs every 8s regardless of state: 3s with the
  panel open, 30s otherwise, and suspended entirely in a background tab.

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
