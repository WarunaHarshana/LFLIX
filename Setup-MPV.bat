@echo off
setlocal EnableDelayedExpansion
title LFLIX - MPV Player Auto-Setup
color 0B
cls

echo ===================================================
echo     LFLIX - MPV Player & Cloud Streaming Setup
echo ===================================================
echo.
echo This script will:
echo   1. Check / Install MPV Player (64-bit)
echo   2. Deploy optimized instant-streaming config (mpv.conf)
echo   3. Set MPV as LFLIX's default external player
echo.
cd /d "%~dp0"

:: Step 1: Detect existing MPV
set "MPV_EXE="

:: Check PATH
where mpv.exe >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%i in ('where mpv.exe 2^>nul') do (
        if not defined MPV_EXE (
            set "MPV_EXE=%%i"
        )
    )
)

:: Check WinGet Packages
if not defined MPV_EXE if defined LOCALAPPDATA (
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\*mpv*") do (
        if exist "%%D\mpv.exe" set "MPV_EXE=%%D\mpv.exe"
    )
    if not defined MPV_EXE if exist "%LOCALAPPDATA%\Programs\mpv\mpv.exe" set "MPV_EXE=%LOCALAPPDATA%\Programs\mpv\mpv.exe"
    if not defined MPV_EXE if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\mpv.exe" set "MPV_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Links\mpv.exe"
)

:: Check standard program paths
if not defined MPV_EXE if exist "bin\mpv\mpv.exe" set "MPV_EXE=%~dp0bin\mpv\mpv.exe"
if not defined MPV_EXE if exist "bin\mpv.exe" set "MPV_EXE=%~dp0bin\mpv.exe"
if not defined MPV_EXE if exist "C:\mpv\mpv.exe" set "MPV_EXE=C:\mpv\mpv.exe"
if not defined MPV_EXE if exist "C:\Program Files\mpv\mpv.exe" set "MPV_EXE=C:\Program Files\mpv\mpv.exe"
if not defined MPV_EXE if exist "C:\Program Files (x86)\mpv\mpv.exe" set "MPV_EXE=C:\Program Files (x86)\mpv\mpv.exe"

if defined MPV_EXE (
    echo [OK] MPV Player found:
    echo      !MPV_EXE!
    echo.
    goto configure_mpv
)

:: Step 2: Install MPV via Winget or Portable fallback
echo [INFO] MPV Player is not installed on this PC.
echo Installing MPV Player now...
echo.

where winget >nul 2>&1
if %errorlevel% == 0 (
    echo Attempting installation via Windows Package Manager (winget)...
    winget install -e --id mpv-player.mpv --accept-package-agreements --accept-source-agreements
    
    :: Re-check after winget install
    where mpv.exe >nul 2>&1
    if !errorlevel! == 0 (
        for /f "tokens=*" %%i in ('where mpv.exe 2^>nul') do if not defined MPV_EXE set "MPV_EXE=%%i"
    )
    if not defined MPV_EXE if defined LOCALAPPDATA (
        for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\*mpv*") do (
            if exist "%%D\mpv.exe" set "MPV_EXE=%%D\mpv.exe"
        )
    )
)

if defined MPV_EXE goto configure_mpv

:: Fallback: Download portable MPV release into bin\mpv
echo.
echo [INFO] Downloading portable MPV player into bin\mpv...
if not exist "bin\mpv" mkdir "bin\mpv"

set "MPV_URL=https://github.com/zhongfly/mpv-winbuild/releases/download/2025-01-05-95092a8/mpv-x86_64-v3-20250105-git-95092a8.7z"
curl -L -s -o "%TEMP%\mpv-portable.zip" "https://sourceforge.net/projects/mpv-player-windows/files/64bit/mpv-x86_64-20240407-git-4560ea5.7z/download" >nul 2>&1

:: If 7z download or extraction fails, try winget again without silent flags
if not exist "bin\mpv\mpv.exe" (
    echo.
    echo Please install MPV using winget or from https://mpv.io/installation/
    echo If winget prompt appears, confirm installation:
    winget install mpv
)

:: Final check
where mpv.exe >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%i in ('where mpv.exe 2^>nul') do if not defined MPV_EXE set "MPV_EXE=%%i"
)
if not defined MPV_EXE if defined LOCALAPPDATA (
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\*mpv*") do (
        if exist "%%D\mpv.exe" set "MPV_EXE=%%D\mpv.exe"
    )
)

if not defined MPV_EXE (
    echo.
    echo [ERROR] Could not automatically locate mpv.exe.
    echo Please install MPV manually or run: winget install mpv
    pause
    exit /b 1
)

:configure_mpv
echo.
echo ===================================================
echo   Deploying Streaming Optimizations (mpv.conf)
echo ===================================================
node "%~dp0scripts\setup-mpv.js" "!MPV_EXE!"

echo.
pause
