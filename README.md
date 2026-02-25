# 🎬 LFLIX

A Netflix-style local media server that organizes and plays your movie & TV show collection. Built with Next.js, SQLite, and your favourite player.

![LFLIX](https://img.shields.io/badge/LFLIX-v0.5.0-red?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎥 **Netflix-style UI** | Dark theme, hero banners, poster grids |
| 📁 **Auto Scanning** | Add folders → movies & shows detected automatically |
| 🔍 **TMDB Metadata** | Posters, ratings, genres fetched automatically |
| 🎮 **Any Player** | VLC, PotPlayer, MPC-HC, mpv — auto-detects and passes correct args |
| 📺 **Live TV (IPTV)** | Import M3U playlists, filter by country/category |
| 🏆 **Live Sports** | Stream live matches (Football, Cricket, Basketball, etc.) |
| 📌 **Watchlist** | Search TMDB for any movie/show, save to download later |
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

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the setup wizard guides you through everything.

**Windows users:** Just double-click `Setup.bat`, then `Start LFLIX.bat`.

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

## 📌 Watchlist

Search TMDB for any movie or show and save it to your watchlist — a personal "to download" list. Items already in your library are marked with an **In Library** badge.

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, SQLite (better-sqlite3) |
| Metadata | TMDB API |
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

**Made with ❤️ for movie enthusiasts who prefer local media** · **⭐ Star if useful!**
