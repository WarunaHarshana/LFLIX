# LFLIX Improvement Plan — Updated Analysis & New Ideas

## Current State Analysis

### What's Already Built ✅
LFLIX is a feature-rich local media server with **30 components**, **36 API routes**, and **10 lib modules**. Key features already working:

- Netflix-style UI with hero banners, poster grids, dark theme
- Auto-scanning folders with TMDB metadata enrichment
- Multi-player support (VLC, PotPlayer, MPC-HC, mpv, HTML5)
- 9+ online streaming servers with availability checking
- Live TV (IPTV) with M3U import and category filtering
- Live Sports streaming
- Torrent search & download with WebTorrent
- Continue Watching / Watch Progress tracking
- "Mark as Watched/Unwatched" toggles & Episode rating grid
- Library Sorting (by Title, Year, Rating, Date Added)
- "Up Next" episode suggestion card
- Keyboard shortcut help overlay (`?`)
- Watchlist with TMDB search
- DLNA casting support
- Mobile access via QR code + Capacitor Android app
- PIN-based authentication
- Technical info badges (4K, HDR, codec, channels)
- Extracted `page.tsx` into 8 modular hooks and 5 section components
- **Unified Global Search Modal** — Press `/` to search across Local Library, TMDB, and Torrents all at once
- **Theme Engine** — Custom base themes (Dark/OLED) with selectable accent colors in settings
- **Smooth Page Transitions** — Route-based enter/exit animations using Framer Motion

---

## Remaining Improvements — Organized by Phase

### 🟢 Phase 0: Quick Wins (Pending)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | **Subtitle support in browser player** — Detect `.srt`/`.ass` files next to video, serve as WebVTT tracks | Medium | 🔥🔥🔥 |
| 4 | **Collections/Lists** — Group movies into custom playlists (e.g., "Marvel Marathon", "Weekend Picks") | Medium | 🔥🔥 |
| 8 | **Multiple user profiles** — Each profile has its own watchlist, continue watching, and watch history | Large | 🔥🔥🔥 |

---

### 🔵 Phase 1: UX Excellence (3-5 days each)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 12 | **Better mobile layout** — The current UI is desktop-first. Optimize card sizes, navigation, and modals for mobile/tablet screens | Large | 🔥🔥🔥 |
| 13 | **Drag & drop torrent files or magnet links** — Drop a `.torrent` file or magnet link anywhere to start downloading | Medium | 🔥🔥 |
| 14 | **Watch party / sync playback** — Allow two browsers to sync playback position (WebSocket-based) | Large | 🔥🔥 |

---

### 🟡 Phase 2: Architecture & Performance

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 16 | **In-memory TMDB cache** — Cache discover/trending/similar results for 15-30 min. Currently every modal open re-fetches TMDB. Simple `Map` with TTL would eliminate many API calls | Small | 🔥🔥🔥 |
| 17 | **State management (Zustand)** — Replace 30+ `useState` calls in `page.tsx` with a proper store. Makes the app faster and less buggy | Medium | 🔥🔥🔥 |
| 18 | **Lazy load components** — Use `React.lazy()` + `Suspense` for heavy modals (StreamServer, IPTV, Torrent, downloads). Cuts initial bundle size | Small | 🔥🔥 |
| 19 | **Image optimization** — Use Next.js `<Image>` component with automatic poster/backdrop resizing instead of raw `<img>` tags everywhere | Medium | 🔥🔥 |
| 20 | **Database indexing** — Add indexes on frequently queried columns (tmdbId, type, title) for faster library queries as collections grow | Small | 🔥🔥 |
| 21 | **Background metadata refresh** — Periodic background job to re-fetch TMDB data for items with missing posters/ratings | Medium | 🔥 |

---

### 🔴 Phase 3: New Features

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 22 | **Movie/show recommendations engine** — "Because you watched X" using TMDB genre/keyword similarity matching across your library | Large | 🔥🔥🔥 |
| 23 | **Built-in subtitle search** — Search and download subtitles from OpenSubtitles API directly from the player or detail modal | Large | 🔥🔥🔥 |
| 24 | **Trakt.tv integration** — Sync watch history, ratings, and watchlists with Trakt | Large | 🔥🔥 |
| 25 | **Scheduled recordings** — For IPTV channels, allow recording scheduled programs | Very Large | 🔥🔥 |
| 26 | **Multi-server support** — Connect multiple LFLIX instances across different PCs and browse a unified library | Very Large | 🔥🔥🔥 |
| 27 | **AI-powered content summary** — Generate "what happened last time" recaps for TV shows using episode descriptions | Medium | 🔥🔥 |
| 28 | **Parental controls** — Content ratings filter and separate kids profile with age-appropriate content only | Large | 🔥🔥 |
| 29 | **Stats dashboard** — Total watch time, most watched genres, library growth over time, storage usage breakdown | Medium | 🔥🔥 |

---

## Next Priority Recommendation

Now that the major `page.tsx` refactoring and the unified search modal are complete, the codebase is much safer and easier to navigate. The highest-impact remaining tasks are:

1. **#1 Subtitle support in browser player** — Crucial for anime and foreign media viewing. Detect `.srt`/`.ass` files locally and serve as tracks.
2. **#16 TMDB in-memory cache** — Easiest and biggest performance win. Eliminates duplicate TMDB network requests.
3. **#17 State management (Zustand)** — Replaces the many remaining `useStates` across the application to make rendering bulletproof.
