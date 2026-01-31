# 🎬 LocalFlix

A Netflix-style local media server that automatically organizes and plays your movie and TV show collection. Built with Next.js, SQLite, and VLC.

![LocalFlix](https://img.shields.io/badge/LocalFlix-v0.1.0-red?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)

## ✨ Features

- 🎥 **Netflix-style UI** - Beautiful dark theme with hero banners and horizontal scrolling
- 📁 **Folder Scanning** - Add folders and automatically detect movies/TV shows
- 🔍 **TMDB Integration** - Auto-fetches posters, ratings, descriptions, and genres
- 📺 **VLC Integration** - Plays media in VLC with fullscreen support
- ⏯️ **Continue Watching** - Resume where you left off
- 🔄 **Automatic Detection** - Watches folders for new files and updates library automatically
- 🎮 **Keyboard Navigation** - Navigate with arrow keys, Enter to play
- 🏷️ **Genre Filtering** - Filter content by genre
- 🔎 **Search** - Instant search across your library

## 📋 Requirements

- **Node.js** 18+ 
- **VLC Media Player** - [Download VLC](https://www.videolan.org/vlc/)
- **Windows** (currently optimized for Windows, Linux/Mac support possible)

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/localflix.git
cd localflix
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

### 4. Open in browser

Navigate to [http://localhost:3000](http://localhost:3000)

### 5. Add your media folders

1. Click the **+** button (or press **F**)
2. Browse to your Movies or TV Shows folder
3. Click **Select Folder** to scan

## ⚙️ Configuration

### VLC Path

By default, LocalFlix looks for VLC at:
```
C:\Program Files\VideoLAN\VLC\vlc.exe
```

To change this:
1. Click the **Settings** icon (⚙️) in the top right
2. Update the VLC path
3. Click **Save Settings**

### TMDB API Key

LocalFlix comes with a default TMDB API key, but you can use your own:
1. Get a free API key at [themoviedb.org](https://www.themoviedb.org/settings/api)
2. Go to **Settings** → **TMDB Integration**
3. Enter your API key and save

## 📁 Folder Structure

LocalFlix automatically detects content type based on filename patterns:

**Movies:**
```
Movies/
├── Inception (2010).mkv
├── The Dark Knight.mp4
└── Interstellar 2014 BluRay.mkv
```

**TV Shows:**
```
TV Shows/
├── Breaking Bad/
│   ├── Breaking.Bad.S01E01.mkv
│   ├── Breaking.Bad.S01E02.mkv
│   └── ...
└── The Office/
    ├── The.Office.S01E01.mp4
    └── ...
```

Supported formats: `.mp4`, `.mkv`, `.avi`, `.mov`, `.m4v`, `.wmv`, `.flv`, `.webm`, `.ts`

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` `↑` `↓` | Navigate content grid |
| `Enter` | Play selected item |
| `/` | Open search |
| `F` | Open folder manager |
| `Esc` | Close modals |

## 🔄 Automatic Folder Watching

LocalFlix automatically watches your scanned folders for new files:

1. When you download/copy a new video file to a watched folder
2. A toast notification appears: "New video detected, scanning..."
3. The file is scanned and metadata is fetched from TMDB
4. Your library updates automatically

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, SQLite (better-sqlite3)
- **File Watching:** Chokidar
- **Media Player:** VLC (via child_process)
- **Metadata:** TMDB API (moviedb-promise)

## 📦 Project Structure

```
localflix/
├── app/
│   ├── api/           # API routes
│   │   ├── browse/    # File browser
│   │   ├── content/   # Library content
│   │   ├── scan/      # Folder scanning
│   │   ├── play/      # VLC playback
│   │   ├── watcher/   # Folder watching SSE
│   │   └── ...
│   ├── components/    # React components
│   ├── settings/      # Settings page
│   └── page.tsx       # Main page
├── lib/
│   ├── db.ts          # SQLite database
│   └── watcher.ts     # File watcher service
└── localflix.db       # SQLite database file
```

## 🐛 Known Issues

- Optimized for Windows; Linux/Mac paths may need adjustments
- VLC must be installed and path configured correctly
- Large libraries may take time to scan initially

## 📄 License

MIT License - feel free to use and modify!

---

**Made with ❤️ for movie enthusiasts who prefer local media**
