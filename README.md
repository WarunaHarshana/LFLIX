# 🎬 LocalFlix

A Netflix-style local media server that automatically organizes and plays your movie and TV show collection. Built with Next.js, SQLite, and VLC.

![LocalFlix](https://img.shields.io/badge/LocalFlix-v0.2.0-red?style=for-the-badge)
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
- 🔒 **PIN Protection** - Secure your library with a PIN
- 🧙 **Easy Setup** - Guided wizard for first-time setup
- 📡 **Live TV (IPTV)** - Import and watch free IPTV channels from around the world
- 🏆 **Live Sports** - Stream live sports matches with embedded player

## 📋 Requirements

- **Node.js** 18+ - [Download here](https://nodejs.org/)
- **VLC Media Player** - [Download VLC](https://www.videolan.org/vlc/)
- **Windows** (currently optimized for Windows)

## 🚀 Quick Start (Easy Way)

### Option 1: Double-click to Start

1. **Double-click** `Start LocalFlix.bat`
2. Wait for the server to start
3. Open your browser to **http://localhost:3000**
4. Follow the setup wizard!

### Option 2: Create Desktop Shortcut

1. **Double-click** `Create Desktop Shortcut.bat`
2. A shortcut appears on your desktop
3. Double-click the **LocalFlix** icon anytime to start

## 🛠️ Manual Setup

If you prefer command line:

```bash
# Clone the repository
git clone https://github.com/WarunaHarshana/localflix.git
cd localflix

# Install dependencies
npm install

# Run the server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## 🧙 First-Time Setup Wizard

On first run, you'll see a simple 4-step wizard:

1. **🔒 Create PIN** - Protect your library (4-6 digits)
2. **🔑 TMDB API Key** - Get free key from [themoviedb.org](https://www.themoviedb.org/settings/api)
3. **📁 Add Folders** - Select where your movies/TV shows are stored
4. **🎬 Start Watching!**

The wizard saves everything automatically - no manual configuration needed!

## 📁 Adding Media

### During Setup
Add folders directly in the setup wizard (Step 3).

### After Setup
1. Click **+** button (or press **F**)
2. Browse to your folder
3. Click **Select Folder**
4. Your media is scanned automatically!

### Folder Structure

LocalFlix automatically detects content from filenames:

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

**Supported formats:** `.mp4`, `.mkv`, `.avi`, `.mov`, `.m4v`, `.wmv`, `.flv`, `.webm`, `.ts`

## ⚙️ Settings

Access settings by clicking the **⚙️** icon (top right).

### Change PIN
Go to **Security** → Enter new PIN → Save

### Change TMDB API Key
Go to **TMDB Integration** → Enter new key → Save

### Change VLC Path
Go to **VLC Settings** → Browse to vlc.exe → Save

(Default: `C:\Program Files\VideoLAN\VLC\vlc.exe`)

## 📡 Live TV (IPTV)

Watch free IPTV channels from around the world:

1. Click **Live TV** tab in navigation
2. Click **Manage Channels** button
3. Import channels:
   - **Free Sources** - Select from worldwide, Sri Lanka, USA, India, etc.
   - **M3U URL** - Paste any M3U playlist URL
   - **M3U File** - Upload .m3u/.m3u8 files
4. Click any channel to start watching!

**Features:**
- Search and filter by category/country
- Channel logos and organization
- Quick channel switching
- Clear all channels option

## 🏆 Live Sports

Stream live sports matches with embedded player:

1. Click **Live Sports** in navigation
2. Filter by sport (Football, Basketball, Cricket, etc.)
3. Toggle between **Live Now** and **Today's Schedule**
4. Click any match → Select stream source
5. Watch in embedded player!

**Supported Sports:** Football, Basketball, Cricket, Tennis, and more

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` `↑` `↓` | Navigate content grid |
| `Enter` | Play selected item |
| `/` | Open search |
| `F` | Open folder manager |
| `Esc` | Close modals |

## 🛡️ Security

- **PIN Protection** - Required to access the app
- **No File Path Exposure** - Full paths never sent to browser
- **Secure API** - All endpoints require authentication

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, SQLite (better-sqlite3)
- **File Watching:** Chokidar
- **Media Player:** VLC (via child_process)
- **Metadata:** TMDB API

## 📦 Project Structure

```
localflix/
├── Start LocalFlix.bat           # ← Double-click to start!
├── Create Desktop Shortcut.bat   # ← Make desktop shortcut
├── app/
│   ├── api/                      # API routes
│   ├── components/               # React components
│   │   ├── SetupWizard.tsx       # ← First-time setup
│   │   ├── LoginScreen.tsx       # ← PIN login
│   │   └── ...
│   ├── settings/                 # Settings page
│   └── page.tsx                  # Main page
├── lib/
│   ├── db.ts                     # SQLite database
│   └── watcher.ts                # File watcher
└── localflix.db                  # Your library database
```

## 🐛 Troubleshooting

### "VLC not found"
- Make sure VLC is installed
- Go to Settings → VLC Settings → Browse to vlc.exe

### "TMDB API error"
- Check your internet connection
- Verify your TMDB API key in Settings

### "Can't access on other devices"
- Make sure both devices are on the same WiFi
- Use your PC's IP address: `http://192.168.1.xxx:3000`

## 📄 License

MIT License - use and modify freely!

---

**Made with ❤️ for movie enthusiasts**
