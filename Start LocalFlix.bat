@echo off
title LocalFlix Server
color 0C

echo ==========================================
echo    LOCALFLIX - Personal Media Server
echo ==========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

:: Check if npm modules exist
if not exist "node_modules" (
    echo Installing dependencies... This may take a few minutes.
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

echo Starting LocalFlix server...
echo.
echo ==========================================
echo    Open your browser to:
echo    http://localhost:3000
echo ==========================================
echo.
echo Press Ctrl+C to stop the server
echo.

:: Start the server
npm run dev

:: If server stops
pause
