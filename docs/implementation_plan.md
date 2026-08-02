# LFLIX Implementation Plan

Current as of the hardening pass in August 2026. LFLIX is a local media server
with **47 components**, **56 API routes**, **26 lib modules** and a **179-test**
Vitest suite, all gated by `npm run verify` in CI.

---

## Recently completed

### Security & correctness
- **Closed two auth bypasses.** `/api/browse` enumerated every drive and file on
  the host without authentication, and `POST /api/setup` would rewrite `APP_PIN`
  for any caller. Both now self-guard via `lib/authGuard.ts`, which allows the
  request only while setup is incomplete or a valid PIN cookie is present. The
  check lives in-route because middleware runs on the edge runtime and cannot
  open SQLite. `GET /api/setup` stays open — the login flow depends on it.
- **Closed the exec chain.** `/api/settings` accepted any existing path as
  `vlcPath` and `/api/play` spawned it. `validatePlayerExecutable` allowlists
  recognised players and runs both on write and at spawn time.
- **Removed the bundled TMDB key** from `lib/metadata.ts`. Keys resolve
  settings → `TMDB_API_KEY` → null; a missing key degrades to filename-derived
  titles instead of aborting the scan.
- **Fixed conditional hooks** in `ContinueWatching` (crashes when items go
  0 → n) and `VideoPlayer`. `react-hooks/rules-of-hooks` is now an error.
- **Fixed an uncaught exception in `/api/stream`.** A Node stream was passed
  straight to `new Response()`; aborting a range request — what every seek does
  — threw `ERR_INVALID_STATE` as an `uncaughtException`.
- **Dependencies:** 23 production vulnerabilities (1 critical) → 12 (0 critical).
  Dropped `dlnacasts`, which was imported nowhere; `lib/dlna.ts` implements SSDP
  directly. Moved `@capacitor/cli` to devDependencies.

### Testing
Vitest suite covering filename parsing, torrent matching and relevance scoring,
path/URL/player validation, `MemoryCache`, stream tokens, the scan grouping
rule, the concurrency helper, and the full middleware + `guardSetupRoute` auth
matrix. Wired into `npm run verify` and CI.

The suite immediately caught a shipped bug: `DDP5.1`, one of the most common
Dolby Digital Plus namings, matched no audio codec at all.

### Architecture
- Every route now uses `readJsonObject` (size-capped, shape-checked) and
  `apiErrorResponse` instead of raw `req.json()` and leaked error messages.
  Rate limits on anything that spawns a process, walks the filesystem, or fans
  out to the network.
- Fixing the resulting type errors surfaced an **SSRF in `/api/iptv/import`**,
  which fetched a caller-supplied URL server-side with no validation.
- **Stream tokens moved to SQLite** (`lib/streamTokens.ts`), stored as SHA-256
  digests. They previously lived in a module-level `Map`, so every restart cut
  off DLNA/Smart TV playback mid-file.
- Pure filename heuristics extracted to `lib/mediaNaming.ts`, shared by the
  scanner and the watcher.

### Performance
- **Scanning runs unrelated titles in parallel** (`groupFilesForScan` +
  `mapWithConcurrency`), keeping each series serial so its `shows` row is only
  created once. The win is local `ffprobe` work; TMDB stays globally rate-limited.
- `/api/content` selects only the columns it maps rather than `SELECT *`.
- WAL is checkpointed on shutdown (it had grown to 4.1 MB against a 585 KB db).

### UI
- Accent utilities (`accent-text`, `accent-chip`, `accent-fill`, …) in
  `globals.css`; brand usages migrated. Semantic colours stay literal.
- `aria-label` on 53 icon-only buttons.

---

## Remaining

### Security
- **PIN hardening.** The cookie value *is* the PIN, compared with `!==`, and
  falls back to `1234` when `APP_PIN` is unset — the login screen even says so.
  Should become a random session id or HMAC compared with `timingSafeEqual`.
  Note this changes the cookie format and logs everyone out, and pairs naturally
  with a session store alongside `stream_tokens`.
- `webtorrent` is the last vulnerable production root; clearing it needs a major
  version bump of a core feature.

### Architecture
- **Break up the monoliths:** `lib/torrentSearch.ts` (1473 lines) into one module
  per provider plus a `matching` module — the pure matching logic already has
  test coverage, so the extraction is safe. Then `lib/downloader.ts` (942), and
  the data fetching in `LiveSports.tsx` / `ContentDetailModal.tsx` into hooks.
- **Typed API contracts** shared between route and caller. Most of the remaining
  ~190 `any` warnings live at these boundaries.
- **Structured logging** to replace ~285 ad-hoc `console.*` calls.

### Performance
- `/api/content` still returns the whole library; filter/sort/pagination should
  move into SQL. The indexes already exist. Note the client filters and sorts
  again, so this needs coordinated changes in `useLibrary`.
- Roughly 20 raw `<img>` remain, all secondary thumbnails. The LCP-critical
  surfaces (`ContentCard`, `HeroSection`, `ContinueWatching`,
  `ContentDetailModal`) already use `TMDBImage`/`next/image`.

### UI
- `role="dialog"`, `aria-modal` and focus traps on the ~15 modals; convert the
  remaining clickable `div`s to buttons.
- Extract the grid arrow-key navigation in `page.tsx` into a reusable hook and
  apply it to Discover, Watchlist and Torrents.
- Surface `lib/sourceHealth.ts` data in `StreamServerModal` so a failed stream
  says which server failed and why.

### Housekeeping
- Capacitor is pinned at v6 while v8 is current; the Android build is drifting.
- A stale `localflix.db` (544 KB) sits in the repo root, superseded by
  `data/lflix.db`. Left in place deliberately — deleting a database file is the
  owner's call.
