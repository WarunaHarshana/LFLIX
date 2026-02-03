@echo off
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

echo ==========================================
echo    Starting LFLIX server...
echo ==========================================
echo.
echo The server will start below.
echo Once you see "Ready" message, open:
echo.
echo    http://localhost:3000
echo.
echo (I'll try to open it automatically after 5 seconds)
echo.
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

:: Start browser after delay (in background)
start /b cmd /c "timeout /t 5 >nul && start http://localhost:3000"

:: Start the server (this blocks)
npm run dev

:: If server stops
echo.
echo ==========================================
echo    Server stopped.
echo ==========================================
pause
