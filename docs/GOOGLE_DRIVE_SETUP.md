# ☁️ Google Drive Setup Guide for LFLIX

This guide walks you through connecting your Google Drive to LFLIX via **Rclone** and **WinFsp**, enabling you to download, organize, and stream your media library directly from the cloud with zero local disk usage.

---

## ⚡ Why Use Your Own Google Drive Client ID?

| Default Public Client ID | Your Own Free Client ID (Recommended) |
|---|---|
| ❌ Shared by millions of Rclone users globally | ✅ 100% dedicated to your personal LFLIX server |
| ❌ Constantly throttled with `403 Rate Limit Exceeded` | ✅ Zero rate-limit pauses or 403 errors |
| ❌ Rclone pauses 8–16 seconds between chunks | ✅ Continuous, full-speed streaming |
| ❌ Upload speed capped at ~2 MB/s | ✅ High-speed transfers (saturates 100–300+ Mbps) |
| ⚠️ Being retired by Google during 2026 | ✅ Permanent & future-proof |

> [!NOTE]
> **Is it free?**
> **Yes, 100% completely free.** Google does not charge for Google Drive API queries or OAuth credentials. No credit card or billing account is required. Google provides a generous free tier of 1 Billion requests per day.

---

## 📋 Step-by-Step Setup

### Step 1: Create a Google Cloud Project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with your Google Account (the one where your Google Drive lives).
3. In the top navigation bar, click the project dropdown and click **New Project**.
4. Name the project `LFLIX-Drive` (or anything you like) and click **Create**.
5. Ensure your new project is selected in the top bar.

---

### Step 2: Configure the OAuth Consent Screen & Test Users

1. In the search bar at the top, search for **Google Auth Platform** (or **OAuth consent screen**) and click it.
2. If prompted to configure:
   - Click **Get started**.
   - **App Name**: `LFLIX`
   - **User support email**: Select your own Gmail address.
   - **Developer contact email**: Enter your own Gmail address.
   - Click **Save and Continue**.
3. **Audience / User type**:
   - Choose **External** and click **Next**.
4. **Scopes (Data Access)**:
   - Click **Save and Continue** (no manual scopes needed here).
5. **Test Users (Crucial Step!)**:
   - Under **Test users**, click **+ ADD USERS**.
   - Type your Gmail address (e.g. `yourname@gmail.com`).
   - Click **Save**.
   *(If you skip this step, Google will display an `Access blocked: 403 access_denied` error during authentication).*

---

### Step 3: Enable the Google Drive API

1. In the top search bar, search for **Google Drive API**.
2. Click **Google Drive API** from the Marketplace / API list.
3. Click the blue **Enable** button.

---

### Step 4: Create Desktop OAuth Credentials

1. On the left sidebar menu, click **Clients** (or **Credentials**).
2. Click **+ Create Client** (or **Create Credentials** → **OAuth client ID**).
3. **Application type**: Select **Desktop app**.
4. **Name**: `rclone` (or `LFLIX`).
5. Click **Create**.
6. A dialog will pop up showing your:
   - **Client ID** (ends with `.apps.googleusercontent.com`)
   - **Client Secret**
7. Copy both of these values, or click **Download JSON**.

---

### Step 5: Connect Google Drive in Rclone

Run **`Setup-GoogleDrive.bat`** in your LFLIX folder, or run `rclone config` in a terminal:

1. Type `n` for **New remote**.
2. Name: `gdrive`
3. Storage type: Type `drive` (Google Drive).
4. **Client ID**: Paste your Client ID from Step 4.
5. **Client Secret**: Paste your Client Secret from Step 4.
6. **Scope**: Choose `1` (`drive` — Full access to all files).
7. **Service Account**: Leave blank (press `Enter`).
8. **Edit advanced config**: Type `n` (press `Enter`).
9. **Use web browser to automatically authenticate?**: Press `Y` (Enter).
10. A browser window will open:
    - Choose your Google account.
    - If you see *"Google hasn't verified this app"*, click **Advanced** → **Go to LFLIX (unsafe)**.
    - Click **Continue / Allow**.
    - The browser will display *"Success!"*.
11. Back in the terminal, for **Configure this as a Shared Drive?**: Type `n` (Enter).
12. Confirm with `y`, then type `q` to quit.

---

### Step 6: Mount Google Drive & Add Library Folders

1. Run **`Mount-GoogleDrive.bat`** (or `Mount-GoogleDrive-Hidden.vbs` for background mounting).
2. Google Drive will mount as drive letter **`Z:`** with volume name `Google Drive`.
   *(In Windows File Explorer, open **This PC** and press `F5` to refresh if not immediately visible).*
3. Open LFLIX Settings at [http://localhost:3000/settings](http://localhost:3000/settings):
   - Under **Google Drive & Cloud Downloads**, enable **Google Drive**.
   - Add your library folders:
     - Movies: `Z:\Media\Movies`
     - TV Shows: `Z:\Media\TV Shows`
   - Click **Save Settings** & **Scan Library**.

---

## 🛠️ Troubleshooting & Tips

### Error: "Access blocked: LFLIX has not completed verification (Error 403: access_denied)"
- **Cause**: Your Gmail address was not added to the Test Users list.
- **Fix**: Go to Google Cloud Console → **Google Auth Platform** → **Audience** (or **OAuth consent screen**) → **Test users** → Click **+ ADD USERS** → add your Gmail address and click **Save**.

### Drive `Z:` does not show in File Explorer
- Press **`F5`** inside Windows File Explorer to refresh drive letters.
- Ensure **WinFsp** is installed (run `Setup-Auto.bat` if missing).
- Run `Mount-GoogleDrive.bat` to launch the mount.

### Keeping Google Drive Mounted on Windows Startup
- Create a shortcut to `Mount-GoogleDrive-Hidden.vbs`.
- Press `Win + R`, type `shell:startup`, and paste the shortcut there.
- Windows will now mount your Google Drive silently in the background on every boot!
