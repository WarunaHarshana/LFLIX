# Changelog

## v0.11.0

Automatic local movie folder organization, companion artwork/subtitle preservation, settings auto-organize toggle, and library ghost card fixes.

### Added

- **Automatic Movie Folder Organization**: Movies are now automatically organized into standard `Movies/<Movie Title (Year)>/<Movie Title (Year)>.<ext>` folder structures, matching the existing organization for TV shows. Enables Windows Explorer video poster/thumbnail previews on folder icons.
- **Companion Artwork & Subtitle Preservation**: Automatically detects and relocates local companion artwork (`folder.jpg`, `poster.jpg`, `backdrop.jpg`, `logo.png`, `landscape.jpg`, `fanart.jpg`) and subtitles (`.srt`, `.vtt`, `.sub`, etc.) with language tags intact into the destination movie folder.
- **Ad & Junk Cleanup**: Filters out promotional URLs, `.nfo` files, advertisements, and sample clips, and automatically deletes temporary release directories once video and companion assets are organized.
- **Auto-Organize Settings Toggle**: Added a user-facing toggle in **Settings** &rarr; **Downloads & Media Organization** allowing users to enable or disable automatic media organization at any time.
- **Startup & Rescan Loose Media Sorting**: Added automatic loose media sorting for movies and TV shows during library scan and startup recovery.

### Fixed

- **Ghost / Blank Show Card on Startup**: Resolved an issue where running test suites could insert uncleaned mock show rows with 0 episodes into SQLite. Hardened `GET /api/content` and `GET /api/search` with episode existence checks to guarantee orphan shows without files never appear in "My Library", added an `afterEach` test cleanup hook, and added startup orphan show cleanup.

## v0.10.0

Comprehensive local library sorting and filtering by language, TMDB original language detection, automated metadata sync, and UI badges.

### Added

- **Library Sorting by Language**: Added **Language (A–Z)** and **Language (Z–A)** sorting modes to the library grid sort dropdown to easily group and navigate movies and TV shows alphabetically by language.
- **Library Filtering by Language**: Added a dedicated **Language Filter** selector in the library header toolbar alongside genre filtering, with active language badges and quick dismiss (`×`) buttons.
- **Language Detection & Metadata Persistence**: Extracted official `original_language` from TMDB and `Language` from OMDb/IMDb into SQLite `movies` and `shows` tables with dedicated indexes (`idx_movies_language`, `idx_shows_language`).
- **Automated Language Metadata Sync**: Added background TMDB language synchronization (`syncAllLibraryLanguages`) that automatically retrieves official language metadata for all library items without requiring manual rescans.
- **Language Tag Badges**: Displayed language badges on media detail modals alongside video and audio codec information.
- **ISO-639-1 Internationalization Support**: Integrated ECMAScript `Intl.DisplayNames` mapping all standard ISO language codes (`en`, `ta`, `hi`, `te`, `ml`, `kn`, `ja`, `ko`, `es`, `fr`, `de`, `it`, `ru`, `zh`, etc.) to full readable English names, with fallback token detection for offline releases.

## v0.9.0

Configurable library grid density / tiles per row, metadata parsing overhaul (tracker prefixes, `A K A` titles, year/number title disambiguation), and new interactive "Fix Match" search tool.

### Added

- **Configurable Grid Density / Tiles Per Row**: Users can now select how many movie/show tiles to display per row across desktop and TV screens (options for 4, 5, 6, 7, 8, or 10 tiles per row). Accessible directly from the library grid toolbar and Settings &rarr; Display Preferences, with persistent storage in localStorage.
- **Interactive "Fix Match" Tool**: New search modal allowing users to search TMDB for any movie or TV show title and re-assign metadata with a single click. Available from both the right-click context menu and the media details modal.
- **Match API (`POST /api/match`)**: Dedicated backend route to match and update TMDB metadata (artwork, overview, rating, IMDb score, genres, release year) and auto-sync TV show episode metadata.

### Fixed

- **Year/Number Title Matching ("1992")**: Resolved an issue where filenames with 4-digit numeric titles (e.g., `1992.2024.1080p.mkv`) wrongly matched older films (*Stripper 1992*). Year extraction now prioritizes bracketed release years and last year tokens before quality tags, while scoring now gives heavy priority to exact title matches.
- **Tracker Prefixes Cleaning**: Extended `stripReleaseSitePrefix` to support all top-level domains (`.report`, `.durban`, `.pm`, `.top`, etc.) and space-separated tracker patterns (`Www 1Tamilmv Report - `, `Tamilblasters - `).
- **`A K A` Alias Handling**: Cleanly strips all variations of `A K A`, `AKA`, `A.K.A.` on releases like *Godzilla Minus One*, *Thunderbolts*, and *The Furious* so queries match accurately on TMDB.

## v0.8.0

Automatic TV show folder structure organization, loose episode auto-sorting, missing episode tracking across all seasons, robust deletion with directory cleanup, and library sorting fixes.

### Added

- **Automatic TV Shows Folder Organization**: TV show downloads automatically organize into `TV Shows/<Show Name>/Season <N>/<Episode.ext>`. Extraneous torrent files (`.nfo`, `.txt`, sample clips, empty directories) are automatically purged upon download completion to keep local drives clean.
- **Loose Episode Auto-Sorting**: Automatically detects and moves loose TV series episodes placed in the downloads folder into their respective `TV Shows/<Show Name>/Season <N>/` directories on startup and library scan.
- **Full-Season Missing Episode Tracking**: Auto-tracking now scans all past seasons to automatically identify and download missing episodes in addition to newly aired releases.
- **Empty Directory Cleanup on Deletion**: Deleting movies removes their dedicated movie folder; deleting the last episode of a TV show season or show cleanly removes the empty `Season <N>/` and `<Show Name>/` directories.
- **In-Progress Download Deletion**: Active torrent downloads can be deleted directly with file cleanup without being blocked by Windows file locks.

### Fixed

- **Library Year & Rating Sorting**: Resolved an issue where TV shows lacked direct year properties, enabling accurate "Year (Newest)" and "Year (Oldest)" sorting across mixed libraries.
- **Interactive Sort Menu**: Replaced hover-only CSS dropdown in `LibraryGrid` with a fully interactive, keyboard-navigable, touch-friendly dropdown.
- **Keyboard Navigation Alignment**: Arrow-key navigation now tracks the active filtered and sorted order.
- **Discover Top Rated**: Calibrated vote count thresholds for TV shows in TMDB Discover.

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
