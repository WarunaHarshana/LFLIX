@echo off
setlocal EnableDelayedExpansion
title LFLIX Server
color 0C

echo ==========================================
echo    LFLIX - Personal Media Server
echo ==========================================
echo.

:: Ensure we're in the correct directory
cd /d "%~dp0"

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ==========================================
    echo    ERROR: Node.js is not installed!
    echo ==========================================
    echo.
    echo Please run 'Setup.bat' first to install Node.js.
    echo.
    echo Or download manually from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

:: Check if npm modules exist
if not exist "node_modules" (
    echo ==========================================
    echo    Installing dependencies...
    echo ==========================================
    echo This may take a few minutes on first run.
    echo.
    
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies!
        echo Please check your internet connection.
        echo.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

:: Check if .env.local exists
if not exist ".env.local" (
    echo ==========================================
    echo    WARNING: Configuration missing!
    echo ==========================================
    echo.
    echo The .env.local file was not found.
    echo You'll need to complete the setup wizard
    echo when you first open LFLIX in your browser.
    echo.
    timeout /t 3 >nul
)

:: ---------------------------------------------------------------------------
:: Clear a stale server off port 3000.
::
:: Closing this window with the X button leaves node.exe running and holding the
:: port. On the next launch Next.js finds 3000 taken and quietly moves to 3001,
:: while the browser below still opens 3000 -- so you land on the old, orphaned
:: server, which answers every route with "404 This page could not be found".
:: ---------------------------------------------------------------------------
set "STALE_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do set "STALE_PID=%%p"

if defined STALE_PID (
    :: Only ever terminate node.exe -- never something else the user has on 3000.
    for /f "tokens=1 delims=," %%n in ('tasklist /FI "PID eq %STALE_PID%" /FO CSV /NH 2^>nul') do set "STALE_NAME=%%~n"

    if /I "!STALE_NAME!"=="node.exe" (
        echo Found a previous LFLIX server still running on port 3000 ^(PID %STALE_PID%^).
        echo Stopping it so this one can start cleanly...
        taskkill /F /PID %STALE_PID% >nul 2>&1
        timeout /t 2 >nul
        echo Done.
        echo.
    ) else (
        echo ==========================================
        echo    WARNING: Port 3000 is already in use
        echo ==========================================
        echo.
        echo Held by "!STALE_NAME!" ^(PID %STALE_PID%^), which is not LFLIX.
        echo LFLIX will start on a different port - watch the address printed below.
        echo.
        timeout /t 4 >nul
    )
)

echo ==========================================
echo    Starting LFLIX server...
echo ==========================================
echo.
echo The server will start below.
echo The browser will open automatically once ready.
echo.
echo    http://localhost:3000
echo.
echo Please stop the server with Ctrl+C rather than closing this window,
echo so it releases port 3000 for next time.
echo ==========================================
echo.

:: Wait for the server to be ready, then open the browser.
:: -f matters: without it curl treats a 404 as success, which is exactly how the
:: orphaned-server case managed to open a broken page.
start /b cmd /c "for /L %%i in (1,1,45) do (curl -sf -o nul http://localhost:3000/api/ping && start http://localhost:3000 && exit /b 0 || timeout /t 2 >nul) & echo Browser auto-open timed out - open http://localhost:3000 manually."

:: Start the server (this blocks)
npm run dev

:: If server stops
echo.
echo ==========================================
echo    Server stopped.
echo ==========================================
pause
