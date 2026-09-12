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
echo OR run 'Setup-Auto.bat' as Administrator for auto-install.
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

:check_aria2
echo Step 3: Checking Aria2c (Fast Multi-Stream Downloader)...
echo.

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
echo.

:check_rclone
echo Step 4: Checking Rclone (Google Drive ^& Cloud Storage)...
echo.

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

echo [MISSING] Rclone not found. Downloading official release into bin\rclone.exe...
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
echo.

:check_winfsp
echo Step 5: Checking WinFsp (required for mounting Google Drive as a Windows drive)...
echo.

if exist "C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll" (
    echo [OK] WinFsp is installed!
    goto check_gdrive_config
)
if exist "C:\Program Files\WinFsp\bin\winfsp-x64.dll" (
    echo [OK] WinFsp is installed!
    goto check_gdrive_config
)

echo [MISSING] WinFsp not found.
echo WinFsp allows Google Drive to appear as a regular drive letter (like Z:) in Windows.
echo Download and install WinFsp?
choice /C YN
if errorlevel 2 goto check_gdrive_config

echo Downloading WinFsp...
curl -L -s -o "%TEMP%\winfsp.msi" "https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-2.0.23075.msi"
if exist "%TEMP%\winfsp.msi" (
    echo Installing WinFsp...
    msiexec /i "%TEMP%\winfsp.msi" /qn /norestart
    del "%TEMP%\winfsp.msi" 2>nul
    echo [OK] WinFsp installed!
) else (
    echo [WARNING] Could not download WinFsp. You can install it manually from https://winfsp.dev/
)
echo.

:check_gdrive_config
echo Step 6: Checking Google Drive configuration...
echo.

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
        echo Would you like to link your Google Drive now?
        choice /C YN /M "Configure Google Drive now"
        if errorlevel 2 goto check_player
        if errorlevel 1 (
            call "Setup-GoogleDrive.bat"
        )
    )
)
echo.

:check_player
echo Step 7: Checking Media Player (MPV recommended for Instant Google Drive Streaming)...
echo.
call "Setup-MPV.bat"
goto done

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
echo (To connect or manage Google Drive anytime, run Setup-GoogleDrive.bat)
echo.

:end
echo Press any key to exit...
pause >nul
