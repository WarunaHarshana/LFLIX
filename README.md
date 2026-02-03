# 🎬 LFLIX

A Netflix-style local media server that automatically organizes and plays your movie and TV show collection. Built with Next.js, SQLite, and VLC.

![LFLIX](https://img.shields.io/badge/LFLIX-v0.4.0-red?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)

## ✨ Features

- 🎥 **Netflix-style UI** - Beautiful dark theme with hero banners and horizontal scrolling
- 📱 **Mobile Support** - Watch on phone, tablet, TV - any device with a browser!
- 📡 **DLNA Server** - Auto-discover on Smart TVs, no browser needed
- 📁 **Folder Scanning** - Add folders and automatically detect movies/TV shows
- 🔍 **TMDB Integration** - Auto-fetches posters, ratings, descriptions, and genres
- 📺 **Live TV (IPTV)** - Import M3U playlists and watch live channels with country filtering
- 🎮 **Any Player** - Use VLC (recommended) or any video player you prefer!
- ⏯️ **Continue Watching** - Resume where you left off
- 🔄 **Automatic Detection** - Watches folders for new files and updates automatically
- 🎮 **Keyboard Navigation** - Navigate with arrow keys, Enter to play
- 🏷️ **Genre Filtering** - Filter content by genre
- 🔎 **Search** - Instant search across your library
- 🔒 **PIN Protection** - Secure your library with a PIN
- 🧙 **Easy Setup** - Guided wizard for first-time setup
- 📲 **QR Code** - Easy mobile connection
- 📡 **Live TV (IPTV)** - Import and watch free IPTV channels from around the world
- 🏆 **Live Sports** - Stream live sports matches (powered by Streamed.pk)

## 📋 System Requirements

LFLIX is **lightweight** and runs on almost any PC!

### Minimum Requirements (Old PCs)
| Component | Requirement |
|-----------|-------------|
| **OS** | Windows 7/8/10/11 |
| **CPU** | Any dual-core processor |
| **RAM** | 2 GB |
| **Storage** | 500 MB for app + your movies |
| **Network** | WiFi or Ethernet (for other devices) |

### Recommended (Best Experience)
| Component | Recommendation |
|-----------|----------------|
| **OS** | Windows 10/11 |
| **CPU** | Intel i3 / AMD Ryzen 3 or better |
| **RAM** | 4 GB+ |
| **Storage** | SSD for app, any drive for movies |
| **Network** | 5GHz WiFi or Ethernet |

### What You Need to Install
All requirements are **automatically installed** by `Setup.bat`:
- **Node.js** 18+ (auto-installed if missing)
- **VLC Media Player** (optional, auto-installed if you choose)

**Don't want auto-install?** See [Manual Setup](#manual-setup) below.

### Why It's Lightweight
- 📦 **Small footprint** - Under 500MB installed
- ⚡ **Fast startup** - Server starts in seconds
- 🧠 **Low RAM usage** - ~100MB when running
- 💾 **Minimal CPU** - Only active when streaming
- 🔋 **Efficient scanning** - Watches folders without constant polling

## 🚀 Quick Start (One-Click Setup!)

### First Time Setup

**Option A: Manual Install (Recommended)**
1. **Double-click** `Setup.bat`
2. If Node.js is missing, download from https://nodejs.org/ (LTS version)
3. Restart your computer
4. Run `Setup.bat` again to install npm packages

**Option B: Auto-Install (Requires Admin)**
1. **Right-click** `Setup-Auto.bat` → **"Run as administrator"**
2. Script automatically downloads and installs Node.js
3. Restart when prompted
4. Run `Setup-Auto.bat` again to finish

### Daily Use
1. **Double-click** `Start LFLIX.bat`
2. Wait for "Ready" message, then open **http://localhost:3000**
3. Browser will open automatically after 5 seconds

### Create Desktop Shortcut
1. **Double-click** `Create Desktop Shortcut.bat`
2. A shortcut appears on your desktop
3. Double-click the **LFLIX** icon anytime to start

## 📱 Mobile & TV Access

LocalFlix works on **any device** on your home network!

### Quick Connect - QR Code
1. Click the **📱 smartphone icon** on PC
2. **Scan the QR code** with your phone
3. Login and start watching!

### Smart TV (Best Experience!)
1. Click the **📡 Cast icon** → Start DLNA Server
2. On TV: Open media player → Browse Network
3. Select **"LFLIX"** → Browse movies!

### Any Device with Browser
1. Find your PC's IP (shown in QR code modal)
2. On any device: Open browser → Type `http://[PC-IP]:3000`
3. Login and watch!

### 📺 Supported Devices

LFLIX works on **literally anything** with a screen:

| Device Type | Examples |
|-------------|----------|
| **Smart TVs** | Samsung, LG, Sony, TCL, Roku, Fire TV |
| **Game Consoles** | PlayStation, Xbox, Nintendo Switch |
| **Mobile** | iPhone, iPad, Android phones/tablets |
| **Computers** | Windows, Mac, Linux, Chromebooks |
| **Streaming** | Chromecast, Apple TV, Roku, Fire Stick |

**Your PC is the server - everything else is just a screen!**

📚 **Full Guides:**
- [Device Compatibility](DEVICE_COMPATIBILITY.md) - Complete device list
- [Player Compatibility](PLAYER_COMPATIBILITY.md) - Video player options
- [DLNA Compatibility](DLNA_COMPATIBILITY.md) - Smart TV setup

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

## 📺 Live TV (IPTV)

Watch live TV channels by importing M3U playlists!

### Adding Live TV Channels
1. Go to the **Live TV** tab
2. Click **Manage IPTV** button
3. Choose your import method:
   - **Public Source**: Import from iptv-org (worldwide playlist)
   - **URL**: Paste an M3U playlist URL
   - **File**: Upload a local M3U file
   - **Manual**: Add channels one by one

### Features
- 🌍 **Country Filter** - Filter channels by country (auto-detected from M3U)
- 🏷️ **Category Filter** - Filter by categories like Sports, News, Movies
- 🔍 **Search** - Find channels by name
- 🗑️ **Delete Channels** - Remove individual channels or clear all
- ▶️ **Live Playback** - Watch streams directly in the app

### M3U Format Support
LFLIX automatically extracts metadata from M3U playlists:
- Channel name, logo, category
- Country (from `tvg-country`, `tvg-id`, or channel name patterns)

## 📁 Adding Media

### During Setup
Add folders directly in the setup wizard (Step 3).

### After Setup
1. Click **+** button (or press **F**)
2. Browse to your folder
3. Click **Select Folder**
4. Your media is scanned automatically!

### Manual Refresh
Click the **🔄 refresh button** in the top nav to scan for new files anytime.

### Folder Structure

LFLIX automatically detects content from filenames:

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

## 📱 Playback Options

LocalFlix works with **any video player** - you have complete freedom!

### Recommended: VLC (Best Compatibility)
- **Desktop**: Auto-launches VLC with fullscreen
- **Mobile**: Open in VLC app for best format support
- **TV**: VLC app can discover LFLIX via DLNA

### Other Players (Your Choice!)
LFLIX provides a **stream URL** that works with:
- **MX Player** (Android)
- **Infuse** (iOS)
- **nPlayer** (iOS/Android)
- **PotPlayer** (Windows)
- **Kodi** (All platforms)
- **Any DLNA-capable player!**

### How to Use Any Player:
1. Click movie → Select **"Copy Stream URL"**
2. Open your preferred player
3. Find **"Network Stream"** or **"Open URL"** option
4. Paste the URL → Play!

**You're not locked into VLC** - use whatever player you prefer! 🎬

## ⚙️ Settings

Access settings by clicking the **⚙️** icon (top right).

### Change PIN
Go to **Security** → Enter new PIN → Save

### Change TMDB API Key
Go to **TMDB Integration** → Enter new key → Save

### Change VLC Path (Desktop)
Go to **VLC Settings** → Browse to vlc.exe → Save

(Default: `C:\Program Files\VideoLAN\VLC\vlc.exe`)

## 📡 Live TV (IPTV)

<<<<<<< HEAD
LFLIX watches your folders and updates automatically:
=======
Watch free IPTV channels from around the world:
>>>>>>> dev

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

Or click the **🔄 refresh button** anytime to manually scan.

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
- **Token-based streaming** - Temporary tokens for external players

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, SQLite (better-sqlite3)
- **File Watching:** Chokidar
- **Media Player:** VLC (via child_process), HTML5 video, DLNA
- **Metadata:** TMDB API
- **Mobile:** QR codes, DLNA/UPnP server

## 📦 Project Structure

```
localflix/
├── Setup.bat                     # ← First time? Run this!
├── Setup-Auto.bat                # ← Auto-install (Admin required)
├── Start LFLIX.bat               # ← Start the server
├── Create Desktop Shortcut.bat   # ← Make desktop shortcut
├── README.md                     # ← This file
├── PLAYER_COMPATIBILITY.md       # ← Compatible video players
├── DEVICE_COMPATIBILITY.md       # ← All supported devices
├── DLNA_COMPATIBILITY.md         # ← DLNA/Smart TV guide
├── app/
│   ├── api/                      # API routes
│   ├── components/               # React components
│   │   ├── SetupWizard.tsx       # ← First-time setup
│   │   ├── LoginScreen.tsx       # ← PIN login
│   │   ├── MobileConnectModal.tsx # ← QR code connection
│   │   ├── DlnaModal.tsx         # ← DLNA server control
│   │   └── ...
│   ├── settings/                 # Settings page
│   └── page.tsx                  # Main page
├── lib/
│   ├── db.ts                     # SQLite database
│   ├── watcher.ts                # File watcher
│   ├── scanner.ts                # Media scanner
│   └── dlna.ts                   # DLNA server
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
- Try the QR code for easy connection

### "DLNA not showing on TV"
- Make sure Windows Firewall allows port 3001
- Some routers block DLNA - check router settings
- Try using browser instead: `http://[PC-IP]:3000`

### "Mobile player not working"
- Use "Play in Browser" for best compatibility
- MP4 files work better than MKV on mobile
- Try copying URL and pasting in your preferred player

### Setup & Installation Issues

**"Setup.bat closes immediately or says Node.js not found"**
- Download Node.js manually from https://nodejs.org/ (LTS version)
- Run installer, restart PC
- Run `Setup.bat` again
- OR use `Setup-Auto.bat` as Administrator for auto-install

**"npm install fails or hangs"**
- Check internet connection
- Delete `node_modules` folder if it exists
- Run: `npm cache clean --force`
- Try again

**"Create Desktop Shortcut.bat doesn't work"**
- Try running as Administrator
- Or manually: Right-click Desktop → New → Shortcut → browse to `Start LFLIX.bat`

**"Window flashes and closes"**
- Run `Setup.bat` first to install dependencies
- Check that `node_modules` folder exists

## 📄 License

MIT License - use and modify freely!

---

**Made with ❤️ for movie enthusiasts who prefer local media**

**⭐ Star this repo if you find it useful!**
