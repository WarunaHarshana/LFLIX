@echo off
title LFLIX Setup (Auto-Install)
color 0E
cls

echo ============================================
echo  LFLIX Setup - Auto Install Mode
echo ============================================
echo.
echo This will automatically install Node.js if needed.
echo.
echo Press Ctrl+C to cancel, or
echo.
pause
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script needs Administrator rights!
    echo.
    echo Please RIGHT-CLICK this file and select:
    echo    "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Node.js already installed:
    node --version
    echo.
    goto install_deps
)

echo [MISSING] Node.js not found. Installing now...
echo.
echo Downloading Node.js v20...
echo (This may take a minute...)
echo.

powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'" -ErrorAction Stop

if not exist "%TEMP%\nodejs.msi" (
    echo ERROR: Download failed!
    pause
    exit /b 1
)

echo Installing Node.js (silent install)...
echo Please wait...
msiexec /i "%TEMP%\nodejs.msi" /qn /norestart

if %errorlevel% neq 0 (
    echo ERROR: Installation failed!
    del "%TEMP%\nodejs.msi" 2>nul
    pause
    exit /b 1
)

del "%TEMP%\nodejs.msi" 2>nul

echo.
echo [OK] Node.js installed!
echo.
echo IMPORTANT: You MUST restart your computer
echo before Node.js will work properly.
echo.
choice /C YN /M "Restart now"
if errorlevel 2 goto no_restart
if errorlevel 1 (
    shutdown /r /t 10 /c "Restarting after Node.js install"
    exit /b
)

:no_restart
echo.
echo Please restart manually, then run Setup.bat again.
echo.
pause
exit /b

:install_deps
echo Installing npm packages...
echo.

cd /d "%~dp0"
if not exist "package.json" (
    echo ERROR: package.json not found!
    pause
    exit /b 1
)

npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo [OK] All packages installed!
echo.

:check_vlc
echo Checking VLC...
echo.

if exist "C:\Program Files\VideoLAN\VLC\vlc.exe" goto vlc_ok
if exist "C:\Program Files (x86)\VideoLAN\VLC\vlc.exe" goto vlc_ok

echo VLC not found. Install? (optional but recommended)
choice /C YN
if errorlevel 2 goto done

echo Downloading VLC...
powershell -Command "Invoke-WebRequest -Uri 'https://get.videolan.org/vlc/3.0.20/win64/vlc-3.0.20-win64.exe' -OutFile '%TEMP%\vlc.exe'" -ErrorAction SilentlyContinue

if exist "%TEMP%\vlc.exe" (
    echo Installing VLC...
    "%TEMP%\vlc.exe" /S
    del "%TEMP%\vlc.exe" 2>nul
    echo [OK] VLC installed!
) else (
    echo Could not download VLC. Install manually from videolan.org
)
goto done

:vlc_ok
echo [OK] VLC already installed!

:done
echo.
echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo You can now run 'Start LFLIX.bat'
echo.
pause
