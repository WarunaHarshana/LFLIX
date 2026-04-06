# LFLIX Implementation Plan

## What's Been Built ✅

LFLIX is a feature-rich local media server with **30 components**, **36 API routes**, and **10 lib modules**.

### Core Platform
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

### Recent Architecture Improvements
- Extracted `page.tsx` into 8 modular hooks and 5 section components
- **Unified Global Search Modal** — Press `/` to search across Local Library, TMDB, and Torrents all at once
- **Theme Engine** — Custom base themes (Dark/OLED) with selectable accent colors in Settings
- **Smooth Page Transitions** — Route-based enter/exit animations using Framer Motion
- **Subtitle Support** — Auto-detects `.srt` files next to videos, converts to WebVTT on the fly via `/api/subtitles` (`app/api/subtitles/route.ts`)
- **In-Memory TMDB Cache** — 30-minute TTL cache (`lib/cache.ts`) wrapping all outbound TMDB calls in `lib/metadata.ts`, eliminating redundant network requests
- **Zustand State Management** — Global store (`app/store/useAppStore.ts`) replacing 15+ `useState` calls in `page.tsx` for cleaner rendering and state sharing
- **Database Indexing** — 15 indexes across all tables (movies, shows, episodes, watch_history, watchlist, iptv_channels, downloads) for faster queries at scale (`lib/db.ts`)

---

## What's Left — Organized by Phase

### 🟢 Phase 0: Quick Wins

| # | Feature | Effort | Impact | Status |
|---|---------|--------|--------|--------|
| 4 | **Collections/Lists** — Group movies into custom playlists (e.g., "Marvel Marathon", "Weekend Picks") | Medium | 🔥🔥 | Pending |

---

### 🔵 Phase 1: UX Excellence

| # | Feature | Effort | Impact | Status |
|---|---------|--------|--------|--------|

| 13 | **Drag & drop torrent files or magnet links** — Drop a `.torrent` file or magnet link anywhere to start downloading | Medium | 🔥🔥 | Pending |

---



### 🔴 Phase 3: New Features

| # | Feature | Effort | Impact | Status |
|---|---------|--------|--------|--------|
| 22 | **Movie/show recommendations engine** — "Because you watched X" using TMDB genre/keyword similarity matching | Large | 🔥🔥🔥 | Pending |
| 23 | **Built-in subtitle search** — Search and download subtitles from OpenSubtitles API directly from the player or detail modal | Large | 🔥🔥🔥 | Pending |
| 24 | **Trakt.tv integration** — Sync watch history, ratings, and watchlists with Trakt | Large | 🔥🔥 | Pending |
| 25 | **Scheduled recordings** — For IPTV channels, allow recording scheduled programs | Very Large | 🔥🔥 | Pending |
| 26 | **Multi-server support** — Connect multiple LFLIX instances across different PCs and browse a unified library | Very Large | 🔥🔥🔥 | Pending |
| 27 | **AI-powered content summary** — Generate "what happened last time" recaps for TV shows using episode descriptions | Medium | 🔥🔥 | Pending |
| 28 | **Parental controls** — Content ratings filter and separate kids profile with age-appropriate content only | Large | 🔥🔥 | Pending |
| 29 | **Stats dashboard** — Total watch time, most watched genres, library growth over time, storage usage breakdown | Medium | 🔥🔥 | Pending |

---

## Completed Items Summary

| # | Feature | Completed In |
|---|---------|-------------|
| 1 | Subtitle support (SRT → WebVTT) | `app/api/subtitles/route.ts` |
| 16 | In-memory TMDB cache (30-min TTL) | `lib/cache.ts`, `lib/metadata.ts` |
| 17 | Zustand state management | `app/store/useAppStore.ts`, `app/page.tsx` |
| 20 | Database indexing (15 indexes) | `lib/db.ts` |
| 18 | Lazy load heavy components | `app/page.tsx` |
| 19 | Next.js Image optimization | `app/components/TMDBImage.tsx`, `next.config.ts`, Various components |
| 21 | Background metadata refresh | `lib/watcher.ts` |
| 12 | Better mobile layout & Connect Fix | `package.json`, Multiple Components |

---

## Next Priority Recommendation

The highest-impact remaining tasks from the roadmap are:

1. **#4 Collections/Lists** — Custom playlists for curated movie nights and marathons.
2. **#23 Built-in subtitle search** — Search and download subtitles from OpenSubtitles directly.
3. **#13 Drag & drop torrent files** — Effortless downloading mechanism.
