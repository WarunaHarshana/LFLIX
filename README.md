# 🎬 LFLIX

A Netflix-style local media server that organizes and plays your movie & TV show collection. Built with Next.js, SQLite, and your favourite player.

![LFLIX](https://img.shields.io/badge/LFLIX-v0.6.0-red?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![CI](https://github.com/WarunaHarshana/LFLIX/actions/workflows/ci.yml/badge.svg)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎥 **Netflix-style UI** | Dark theme, hero banners, poster grids |
| 🌍 **Discover & Stream** | Browse trending movies & TV shows from TMDB. Watch online instantly! |
| 🎬 **Stream Anywhere** | 9+ integrated streaming servers with automatic runtime availability filtering |
| 📁 **Auto Scanning** | Add folders → movies & shows detected automatically |
| 🔍 **TMDB Metadata** | Posters, ratings, genres fetched automatically |
| 🎮 **Any Player** | VLC, PotPlayer, MPC-HC, mpv — auto-detects and passes correct args |
| 📺 **Live TV (IPTV)** | Import M3U playlists, filter by country/category |
| 🏆 **Live Sports** | Stream live matches (Football, Cricket, Basketball, etc.) |
| 📌 **Watchlist** | Search TMDB for any movie/show, save to download later |
| 🧲 **Torrent Search** | Search & download torrents directly — pick quality, choose library folder |
| ⏸️ **Download Manager** | Pause, resume, delete downloads with progress tracking |
| ⏯️ **Continue Watching** | Resume where you left off |
| 📱 **Mobile & TV** | Access from any device via browser, QR code, or DLNA |
| 📡 **DLNA Server** | Auto-discover on Smart TVs |
| 🔒 **PIN Protection** | Secure your library |
| ⌨️ **Keyboard Navigation** | Arrow keys, Enter, search with `/` |

## 🚀 Quick Start

```bash
# Clone & install
git clone https://github.com/WarunaHarshana/LFLIX.git
cd LFLIX
npm install

# Configure — see .env.example for every supported variable
cp .env.example .env.local

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the setup wizard guides you through everything.

**Windows users:** Just double-click `Setup.bat`, then `Start LFLIX.bat`.

### Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_PIN` | Yes | Sign-in PIN. Unset falls back to a well-known default — set it. |
| `TMDB_API_KEY` | Yes | Posters, ratings, Discover, episode data. [Free key](https://www.themoviedb.org/settings/api). Without it the library still scans, but titles come from filenames. |
| `OMDB_API_KEY` | No | Adds IMDb ratings. |

`TMDB_API_KEY` and `OMDB_API_KEY` can also be set in Settings, which takes precedence. See [.env.example](.env.example) for the rest.

## ✅ Quality Gates

```bash
npm run verify
```

Runs TypeScript checking, ESLint, the test suite, and a production Next.js build. The same checks run in GitHub Actions on pushes to `main` and on pull requests.

```bash
npm test
```

Vitest suite covering filename parsing, torrent matching, path/URL validation, caching, stream tokens, and the API auth boundary. `npm run test:watch` for watch mode.

## 📁 Media Structure

```
Movies/
├── Inception (2010).mkv
├── The Dark Knight.mp4

TV Shows/
├── Breaking Bad/
│   ├── Breaking.Bad.S01E01.mkv
│   ├── Breaking.Bad.S01E02.mkv
```

**Supported:** `.mp4` `.mkv` `.avi` `.mov` `.m4v` `.wmv` `.flv` `.webm` `.ts`

## 📱 Access from Any Device

| Method | How |
|--------|-----|
| **QR Code** | Click 📱 icon → scan with phone |
| **Browser** | Open `http://[PC-IP]:3000` on any device |
| **DLNA** | Click 📡 icon → Smart TV auto-discovers |

Works on Smart TVs, phones, tablets, game consoles — anything with a screen.

## 🌐 Streaming Server Behavior

LFLIX now checks third-party movie/TV stream servers at request time and only shows servers that appear reachable and embeddable.

- Checks are best-effort with a short timeout to keep the UI responsive.
- Server availability can change by region, ISP, anti-bot challenges, or upstream outages.
- A server that passes pre-check can still fail during playback; switch servers if needed.

## 📌 Watchlist

Search TMDB for any movie or show and save it to your watchlist — a personal "to download" list. Items already in your library are marked with an **In Library** badge.

## 🧲 Torrent Downloads

| Action | How |
|--------|-----|
| **Torrents tab** | Click 🧲 Torrents → search anything (e.g. `Vikings S01E01 2160p`) → one-click download |
| **Watchlist download** | Hover a watchlist card → click ⬇ → auto-searches by title → pick quality |
| **Magnet link** | Paste a magnet URI directly in either the Torrents tab or the Watchlist modal |
| **Folder chooser** | Pick which library folder to save to (auto-import when done) |
| **Download panel** | Click ⬇ in navbar → see progress, pause ⏸, resume ▶, delete 🗑 |

Direct-download results include the built-in open-directory source and Internet Archive. You can add private or self-hosted open-directory roots with `DDL_OPEN_DIR_BASES`, and optionally narrow them with `DDL_OPEN_DIR_PATHS`, `DDL_OPEN_DIR_MOVIE_PATHS`, or `DDL_OPEN_DIR_TV_PATHS` as comma-separated paths.

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, SQLite (better-sqlite3) |
| Metadata | TMDB API |
| Torrents / DDL | WebTorrent, apibay.org (TPB API), YTS, PSA, open-directory DDL, Internet Archive DDL |
| Players | VLC, PotPlayer, MPC-HC, mpv, HTML5, DLNA |
| File Watching | Chokidar |

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `← → ↑ ↓` | Navigate |
| `Enter` | Play |
| `/` | Search |
| `F` | Folder manager |
| `Esc` | Close modal |

## 📄 License

MIT — use and modify freely.

---

Made for movie enthusiasts who prefer local media.
