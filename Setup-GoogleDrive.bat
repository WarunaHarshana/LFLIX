@echo off
title LFLIX - Google Drive Setup
color 0B
cls
echo ============================================
echo   LFLIX Google Drive ^& Rclone Setup
echo ============================================
echo.
cd /d "%~dp0"

set "RCLONE_BIN="
if exist "bin\rclone.exe" set "RCLONE_BIN=bin\rclone.exe"
if not defined RCLONE_BIN (where rclone >nul 2>&1 && set "RCLONE_BIN=rclone")
if not defined RCLONE_BIN if exist "C:\Rclone\rclone.exe" set "RCLONE_BIN=C:\Rclone\rclone.exe"

if not defined RCLONE_BIN (
    echo [MISSING] Rclone is not installed yet.
    echo Please run Setup-Auto.bat first to install Rclone and WinFsp.
    echo.
    pause
    exit /b 1
)

echo Using Rclone: %RCLONE_BIN%
echo.
echo Current configured remotes:
%RCLONE_BIN% listremotes
echo.
echo ============================================
echo Instructions to connect Google Drive:
echo   1. Type 'n' for New remote
echo   2. Name: gdrive
echo   3. Storage: Google Drive (type 'drive')
echo   4. Leave Client ID / Secret blank (press Enter)
echo   5. Scope: choose 1 (Full access)
echo   6. Service Account: press Enter
echo   7. Advanced config: type 'n'
echo   8. Web browser will open to sign in with Google
echo   9. Confirm and press 'q' to quit when done
echo ============================================
echo.
pause
%RCLONE_BIN% config
echo.
echo ============================================
echo Setup complete!
echo.
choice /C YN /M "Would you like to mount Google Drive (Z:) now with optimized streaming"
if errorlevel 2 goto done_gdrive
if errorlevel 1 (
    echo Starting Google Drive mount in background...
    start "" wscript "%~dp0Mount-GoogleDrive-Hidden.vbs"
    timeout /t 2 >nul
    echo Google Drive mounted to Z:
)

:done_gdrive
echo.
echo Open LFLIX Settings (http://localhost:3000/settings)
echo to configure library folders or test the connection.
echo ============================================
pause
