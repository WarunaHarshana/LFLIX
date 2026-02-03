@echo off
title LocalFlix Server
color 0C
cls

echo ============================================
echo  LOCALFLIX - Personal Media Server
echo ============================================
echo.

:: Ensure we're in the correct directory
cd /d "%~dp0"

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ============================================
    echo  ERROR: Node.js is not installed!
    echo ============================================
    echo.
    echo Please run Setup.bat first to install Node.js.
    echo Or download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js version:
node --version
echo.

:: Check if npm modules exist
if not exist "node_modules" (
    echo [INFO] Installing dependencies... This may take a few minutes.
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
    echo [OK] Dependencies installed!
    echo.
)

:: Check if .env.local exists
if not exist ".env.local" (
    echo [WARNING] Configuration missing!
    echo You'll need to complete the setup wizard
    echo when you first open LocalFlix in your browser.
    echo.
    timeout /t 3 >nul
)

echo ============================================
echo  Starting LocalFlix server...
echo ============================================
echo.
echo The server will start below.
echo Once ready, your browser will open automatically.
echo.
echo    URL: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ============================================
echo.

:: Open browser after 5 second delay (give server time to start)
start /b cmd /c "timeout /t 5 >nul && start http://localhost:3000"

:: Start the server (this blocks)
npm run dev

:: If server stops
echo.
echo ============================================
echo  Server stopped.
echo ============================================
pause
