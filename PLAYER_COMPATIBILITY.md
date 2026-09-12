# LocalFlix Player Compatibility

## ✅ Fully Compatible Players

### Mobile Players
| Player | Platform | How to Use | Notes |
|--------|----------|------------|-------|
| **VLC** | iOS/Android | DLNA auto-discovery or direct URL | Best overall support |
| **MX Player** | Android | Open Network Stream → Paste URL | Excellent for Android |
| **Infuse** | iOS | Files → Add → WebDAV/URL | Premium player, great UI |
| **nPlayer** | iOS/Android | Network → HTTP Streaming | Great subtitle support |
| **BSPlayer** | Android | Network stream | Hardware acceleration |

### Desktop Players
| Player | Platform | How to Use | Notes |
|--------|----------|------------|-------|
| **MPV** (Recommended) | Windows/Mac/Linux | Direct / Auto-Launch (`Setup-MPV.bat`) | Instant cloud streaming (2M chunk open), 0.1s exit, D3D11 GPU, HDR-to-SDR |
| **VLC** | Windows/Mac/Linux | Media → Open Network Stream | Universal format support |
| **PotPlayer** | Windows | Open → Open URL | Lightweight, rich controls |
| **Kodi** | All | Add source → HTTP/DLNA | Home theater experience |
| **MPC-HC** | Windows | File → Open File/URL | Classic lightweight DirectShow player |

## 📋 How to Use Any Player

### Method 1: Copy URL (Works with ALL players)
1. Click movie in LocalFlix
2. Select **"Copy Stream URL"**
3. Open your video player
4. Find **"Network Stream"** or **"Open URL"** option
5. Paste the URL
6. Play!

### Method 2: DLNA (Players with network discovery)
1. Start DLNA Server in LocalFlix
2. Open player → Browse → Network
3. Look for "LocalFlix" server
4. Browse and play!

## ⚠️ Limited Compatibility

These players have restrictions:

| Player | Issue | Workaround |
|--------|-------|------------|
| **Default iOS Video** | No network stream support | Use browser player instead |
| **Default Android Video** | Limited format support | Use browser player |
| **Windows Movies & TV** | No URL support | Use VLC on PC |
| **QuickTime** | Limited formats | Use browser player |

## 🔧 Universal Solution

The **browser player** ("Play in Browser") works on ALL devices since it uses HTML5 video - no app installation needed!

## 🎯 Recommendation by Platform

### iPhone/iPad
1. **Infuse** (Best UI, all formats)
2. **nPlayer** (Great features)
3. **Browser player** (No install needed)

### Android
1. **MX Player** (Popular, free)
2. **VLC** (All formats)
3. **Browser player** (Simplest)

### Windows
1. **MPV** (Recommended — Instant Cloud Streaming & fast seek via `Setup-MPV.bat`)
2. **VLC** (Universal compatibility)
3. **PotPlayer** (Lightweight)
4. **Browser** (Access via IP)

## 🔒 Security Note

The stream URL includes a temporary token that expires in 24 hours, so shared URLs won't work forever - this is for security!
