@echo off
title LFLIX - Mount Google Drive
color 0B
cls

echo ===================================================
echo       LFLIX Google Drive Cloud Mount (Z:)
echo       Optimized: Instant Open (2M) ^& Instant Close (0s)
echo ===================================================
echo.
cd /d "%~dp0"

:: 1. Locate Rclone executable
set "RCLONE_BIN="
if exist "bin\rclone.exe" set "RCLONE_BIN=%~dp0bin\rclone.exe"
if not defined RCLONE_BIN (where rclone >nul 2>&1 && set "RCLONE_BIN=rclone")
if not defined RCLONE_BIN if exist "C:\Rclone\rclone.exe" set "RCLONE_BIN=C:\Rclone\rclone.exe"

if not defined RCLONE_BIN (
    echo [ERROR] rclone.exe not found!
    echo Please run Setup-Auto.bat to install Rclone and WinFsp.
    pause
    exit /b 1
)

:: 2. Check WinFsp
if not exist "C:\Program Files\WinFsp\bin\winfsp-x64.dll" if not exist "C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll" (
    echo [WARNING] WinFsp is not detected.
    echo WinFsp is required to mount cloud drives as Windows drive letters.
)

:: 3. Kill existing rclone mounts
taskkill /IM rclone.exe /F >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: 4. Cache directory
set "CACHE_DIR=C:\RcloneCache"
if exist "H:\" set "CACHE_DIR=H:\RcloneCache"
if exist "D:\LFLIX-Temp" set "CACHE_DIR=D:\LFLIX-Temp\rclone-cache"

echo Mounting remote 'gdrive:' to Z: ...
echo Using Cache: %CACHE_DIR%
echo.

"%RCLONE_BIN%" mount gdrive: Z: ^
  --rc ^
  --rc-no-auth ^
  --rc-addr 127.0.0.1:5572 ^
  --cache-dir "%CACHE_DIR%" ^
  --vfs-cache-mode full ^
  --vfs-cache-max-size 20G ^
  --vfs-cache-max-age 24h ^
  --vfs-read-chunk-size 2M ^
  --vfs-read-chunk-size-limit 64M ^
  --vfs-handle-caching 0s ^
  --vfs-read-wait 0ms ^
  --vfs-fast-fingerprint ^
  --buffer-size 16M ^
  --drive-pacer-min-sleep 10ms ^
  --drive-pacer-burst 200 ^
  --volname "Google Drive" ^
  --poll-interval 15s ^
  --dir-cache-time 24h ^
  --attr-timeout 24h ^
  --no-modtime ^
  --no-checksum ^
  --log-level NOTICE
