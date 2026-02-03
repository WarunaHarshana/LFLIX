@echo off
title LFLIX Setup
color 0A
cls

echo ============================================
echo  LFLIX Setup
echo ============================================
echo.
echo Step 1: Checking if Node.js is installed...
echo.

:: Check Node.js
node --version 2>nul
if %errorlevel% == 0 (
    echo [OK] Node.js is installed:
    node --version
    echo.
    goto install_deps
)

echo [MISSING] Node.js not found!
echo.
echo To install Node.js:
echo 1. Go to https://nodejs.org/
echo 2. Download the LTS version
echo 3. Run the installer (Next, Next, Next...)
echo 4. Restart your computer
echo 5. Run this Setup.bat again
echo.
echo OR run this batch file as Administrator for auto-install.
echo.
echo Right-click Setup.bat -^> Run as administrator
echo.
pause
goto end

:install_deps
echo Step 2: Installing npm packages...
echo.

cd /d "%~dp0"

if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Please run this from the LFLIX folder.
    pause
    goto end
)

echo Running: npm install
echo (This may take a few minutes...)
echo.

npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm install failed!
    echo.
    echo Try these fixes:
    echo 1. Check internet connection
    echo 2. Run: npm cache clean --force
    echo 3. Delete 'node_modules' folder if it exists
    echo 4. Try again
echo.
    pause
    goto end
)

echo.
echo [OK] npm packages installed!
echo.

:check_vlc
echo Step 3: Checking VLC Media Player...
echo.

if exist "C:\Program Files\VideoLAN\VLC\vlc.exe" goto vlc_ok
if exist "C:\Program Files (x86)\VideoLAN\VLC\vlc.exe" goto vlc_ok

echo VLC not found (optional but recommended for best playback)
echo.
echo Download from: https://videolan.org/vlc/
echo.
goto done

:vlc_ok
echo [OK] VLC is installed!
echo.

:done
echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo Next steps:
echo 1. Double-click 'Start LFLIX.bat'
echo 2. Open browser to http://localhost:3000
echo 3. Complete the setup wizard
echo.

:end
echo Press any key to exit...
pause >nul
