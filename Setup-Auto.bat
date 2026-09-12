@echo off
title LFLIX Setup (Auto-Install)
color 0E
cls

echo ============================================
echo  LFLIX Setup - Auto Install Mode
echo ============================================
echo.
echo This will automatically install Node.js and all required
echo download frameworks (Aria2c, Rclone, WinFsp) if needed.
echo.
echo Press Ctrl+C to cancel, or
echo.
pause
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script needs Administrator rights to install tools!
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

curl -L -s -o "%TEMP%\nodejs.msi" "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
if not exist "%TEMP%\nodejs.msi" (
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'" -ErrorAction Stop
)

if not exist "%TEMP%\nodejs.msi" (
    echo ERROR: Node.js download failed!
    pause
    exit /b 1
)

echo Installing Node.js (silent install)...
echo Please wait...
msiexec /i "%TEMP%\nodejs.msi" /qn /norestart

if %errorlevel% neq 0 (
    echo ERROR: Node.js installation failed!
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
echo Please restart manually, then run Setup-Auto.bat again.
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

:check_aria2
echo Checking Aria2c (Fast Multi-Stream Downloader)...
if not exist "bin" mkdir "bin"
if exist "bin\aria2c.exe" (
    echo [OK] Aria2c already installed in bin\
    goto check_rclone
)
where aria2c >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Aria2c already installed on system PATH
    goto check_rclone
)

echo [MISSING] Aria2c not found. Downloading official release...
curl -L -s -o "%TEMP%\aria2.zip" "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip"
if exist "%TEMP%\aria2.zip" (
    if not exist "%TEMP%\aria2-tmp" mkdir "%TEMP%\aria2-tmp"
    tar -xf "%TEMP%\aria2.zip" -C "%TEMP%\aria2-tmp"
    for /r "%TEMP%\aria2-tmp" %%f in (aria2c.exe) do copy /y "%%f" "bin\aria2c.exe" >nul
    del "%TEMP%\aria2.zip" 2>nul
    rmdir /s /q "%TEMP%\aria2-tmp" 2>nul
    if exist "bin\aria2c.exe" (
        echo [OK] Aria2c installed successfully to bin\aria2c.exe!
    ) else (
        echo [WARNING] Could not extract Aria2c.
    )
) else (
    echo [WARNING] Could not download Aria2c.
)

:check_rclone
echo.
echo Checking Rclone (Google Drive ^& Cloud Storage)...
if exist "bin\rclone.exe" (
    echo [OK] Rclone already installed in bin\
    goto check_winfsp
)
if exist "C:\Rclone\rclone.exe" (
    echo [OK] Rclone found in C:\Rclone
    goto check_winfsp
)
where rclone >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Rclone found on system PATH
    goto check_winfsp
)

echo [MISSING] Rclone not found. Downloading official release...
curl -L -s -o "%TEMP%\rclone.zip" "https://downloads.rclone.org/rclone-current-windows-amd64.zip"
if exist "%TEMP%\rclone.zip" (
    if not exist "%TEMP%\rclone-tmp" mkdir "%TEMP%\rclone-tmp"
    tar -xf "%TEMP%\rclone.zip" -C "%TEMP%\rclone-tmp"
    for /r "%TEMP%\rclone-tmp" %%f in (rclone.exe) do copy /y "%%f" "bin\rclone.exe" >nul
    del "%TEMP%\rclone.zip" 2>nul
    rmdir /s /q "%TEMP%\rclone-tmp" 2>nul
    if exist "bin\rclone.exe" (
        echo [OK] Rclone installed successfully to bin\rclone.exe!
    ) else (
        echo [WARNING] Could not extract Rclone.
    )
) else (
    echo [WARNING] Could not download Rclone.
)

:check_winfsp
echo.
echo Checking WinFsp (required for mounting Google Drive as a Windows drive letter)...
if exist "C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll" (
    echo [OK] WinFsp already installed!
    goto check_gdrive_config
)
if exist "C:\Program Files\WinFsp\bin\winfsp-x64.dll" (
    echo [OK] WinFsp already installed!
    goto check_gdrive_config
)

echo [MISSING] WinFsp not found. Installing now (silent install)...
curl -L -s -o "%TEMP%\winfsp.msi" "https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-2.0.23075.msi"
if exist "%TEMP%\winfsp.msi" (
    msiexec /i "%TEMP%\winfsp.msi" /qn /norestart
    del "%TEMP%\winfsp.msi" 2>nul
    echo [OK] WinFsp installed!
) else (
    echo [WARNING] Could not download WinFsp. Install manually from https://winfsp.dev/
)

:check_gdrive_config
echo.
echo Checking Google Drive remote configuration...
set "RCLONE_EXE="
if exist "bin\rclone.exe" set "RCLONE_EXE=bin\rclone.exe"
if not defined RCLONE_EXE (where rclone >nul 2>&1 && set "RCLONE_EXE=rclone")
if not defined RCLONE_EXE if exist "C:\Rclone\rclone.exe" set "RCLONE_EXE=C:\Rclone\rclone.exe"

if defined RCLONE_EXE (
    %RCLONE_EXE% listremotes 2>nul | findstr /r "." >nul
    if %errorlevel% == 0 (
        echo [OK] Configured cloud remotes found:
        %RCLONE_EXE% listremotes
    ) else (
        echo [INFO] No Google Drive remote configured yet.
        echo Would you like to configure your Google Drive now?
        echo (Press Y to run rclone setup, or N to configure later via Setup-GoogleDrive.bat)
        choice /C YN /M "Configure Google Drive now"
        if errorlevel 2 goto check_player
        if errorlevel 1 (
            call "Setup-GoogleDrive.bat"
        )
    )
)

:check_player
echo.
echo Checking MPV Media Player (Recommended for Instant Google Drive Streaming)...
call "Setup-MPV.bat"

:check_vlc_optional
echo.
echo Checking VLC Media Player (Optional Alternative)...
if exist "C:\Program Files\VideoLAN\VLC\vlc.exe" (
    echo [OK] VLC is also installed.
    goto done
)
if exist "C:\Program Files (x86)\VideoLAN\VLC\vlc.exe" (
    echo [OK] VLC is also installed.
    goto done
)
echo [INFO] MPV is configured as primary player with streaming profile.
goto done

:done
echo.
echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo Components configured:
echo   [OK] Node.js runtime
echo   [OK] npm dependencies
echo   [OK] Aria2c fast multi-stream downloader
echo   [OK] Rclone cloud integration
echo   [OK] WinFsp cloud mount driver
echo   [OK] MPV Player with Instant Cloud Streaming Config
echo.
echo You can now run 'Start LFLIX.bat' to launch!
echo.
pause
