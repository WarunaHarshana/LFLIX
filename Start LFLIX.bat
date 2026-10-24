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
    ping -n 4 127.0.0.1 >nul
)

:: ---------------------------------------------------------------------------
:: Auto-Mount Google Drive (Z:) if not already mounted
:: ---------------------------------------------------------------------------
vol Z: >nul 2>&1
if errorlevel 1 (
    if exist "Mount-GoogleDrive-Hidden.vbs" (
        echo Mounting Google Drive Z:...
        wscript.exe "Mount-GoogleDrive-Hidden.vbs"
        ping -n 3 127.0.0.1 >nul
    )
)

:: ---------------------------------------------------------------------------
:: 1. Check if LFLIX is ALREADY running and healthy.
:: If so, open the browser directly and exit.
:: (Use 'Start LFLIX.bat --restart' to force a fresh server restart)
:: ---------------------------------------------------------------------------
if /I not "%1"=="--restart" if /I not "%1"=="-r" (
    set "ALREADY_PORT="
    for /f %%p in ('node -e "const http=require('http'); const ports=[3000,4000,3550,8080]; function check(i){ if(i>=ports.length){ process.exit(1); } const req=http.get('http://localhost:'+ports[i]+'/api/ping',{timeout:1000},res=>{ if(res.statusCode===200){ console.log(ports[i]); process.exit(0); } else check(i+1); }); req.on('error',()=>check(i+1)); req.on('timeout',()=>{req.destroy();check(i+1);}); } check(0);"') do set "ALREADY_PORT=%%p"

    if defined ALREADY_PORT (
        echo ==========================================
        echo    LFLIX is already running!
        echo ==========================================
        echo.
        echo Found active server on http://localhost:!ALREADY_PORT!
        echo Opening LFLIX in your browser...
        echo.
        start http://localhost:!ALREADY_PORT! || powershell -NoProfile -NonInteractive -Command "Start-Process 'http://localhost:!ALREADY_PORT!'" >nul 2>&1
        ping -n 3 127.0.0.1 >nul
        exit /b 0
    )
)

:: ---------------------------------------------------------------------------
:: 2. Clear a stale/unresponsive server off port 3000.
::
:: Closing the console window with the X button leaves node.exe running and holding
:: the port. On the next launch Next.js finds 3000 taken and quietly moves to 3001,
:: while the browser below still opens 3000 -- landing on an unresponsive server.
:: ---------------------------------------------------------------------------
set "STALE_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do set "STALE_PID=%%p"

if defined STALE_PID (
    :: Only ever terminate node.exe -- never something else the user has on 3000.
    for /f "tokens=1 delims=," %%n in ('tasklist /FI "PID eq !STALE_PID!" /FO CSV /NH 2^>nul') do set "STALE_NAME=%%~n"

    if /I "!STALE_NAME!"=="node.exe" (
        echo Found an unresponsive LFLIX server on port 3000 ^(PID !STALE_PID!^).
        echo Stopping it so this one can start cleanly...
        taskkill /F /PID !STALE_PID! >nul 2>&1
        ping -n 3 127.0.0.1 >nul
        echo Done.
        echo.
    ) else (
        echo ==========================================
        echo    WARNING: Port 3000 is already in use
        echo ==========================================
        echo.
        echo Held by "!STALE_NAME!" ^(PID !STALE_PID!^), which is not LFLIX.
        echo LFLIX will start on a different port - watch the address printed below.
        echo.
        ping -n 3 127.0.0.1 >nul
    )
)

:: ---------------------------------------------------------------------------
:: 3. Detect available port.
:: If port 3000 is blocked by Windows (Hyper-V / WinNAT exclusion),
:: automatically fall back to 4000, 3550, or 8080.
:: ---------------------------------------------------------------------------
set "LFLIX_PORT=3000"
for /f %%p in ('node -e "const http=require('http'); const ports=[3000,4000,3550,8080]; function test(i){ if(i>=ports.length){console.log(3000);process.exit(0);} const s=http.createServer(); s.listen(ports[i],'0.0.0.0',()=>{ s.close(()=>{ console.log(ports[i]); process.exit(0); }); }).on('error',()=>{ test(i+1); }); } test(0);"') do set "LFLIX_PORT=%%p"

if not "!LFLIX_PORT!"=="3000" (
    echo ==========================================
    echo    NOTICE: Port 3000 reserved by Windows
    echo ==========================================
    echo Windows Hyper-V / WinNAT has reserved port 3000.
    echo Starting LFLIX on port !LFLIX_PORT! instead:
    echo.
    echo    http://localhost:!LFLIX_PORT!
    echo.
    echo ^(To reclaim port 3000, open CMD as Administrator and run:
    echo  net stop winnat ^&^& net start winnat^)
    echo ==========================================
    echo.
)

echo ==========================================
echo    Starting LFLIX server...
echo ==========================================
echo.
echo The server will start below.
echo The browser will open automatically once ready.
echo.
echo    http://localhost:!LFLIX_PORT!
echo.
echo Please stop the server with Ctrl+C rather than closing this window,
echo so it releases port !LFLIX_PORT! for next time.
echo ==========================================
echo.

:: ---------------------------------------------------------------------------
:: 4. Wait for server to become ready, then open the browser automatically.
:: scripts/open-browser.js polls /api/ping until ready, then launches browser.
:: ---------------------------------------------------------------------------
start "" /b node "%~dp0scripts\open-browser.js" !LFLIX_PORT!

:: Start the server (this blocks)
set "PORT=!LFLIX_PORT!"
call npm run dev -- -p !LFLIX_PORT!

:: If server stops
echo.
echo ==========================================
echo    Server stopped.
echo ==========================================
pause
