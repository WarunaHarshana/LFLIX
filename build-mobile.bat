@echo off
chcp 65001 > nul
echo ============================================
echo LFLIX Mobile Build Script
echo ============================================
echo.

REM Check if we're in the right directory
if not exist "capacitor.config.ts" (
    echo ERROR: Please run this script from the LFLIX project root
    exit /b 1
)

echo [1/7] Installing dependencies...
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo [2/7] Temporarily excluding API routes for static export...
if exist "app\api" (
    rename app\api api_backup
) else (
    echo WARNING: app\api not found, skipping...
)

echo.
echo [3/7] Building web app (static export)...
set NEXT_EXPORT=1
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    echo Restoring API routes...
    if exist "app\api_backup" rename app\api_backup api
    exit /b 1
)

echo.
echo [4/7] Restoring API routes...
if exist "app\api_backup" (
    rename app\api_backup api
)

echo.
echo [5/7] Copying Capacitor config to mobile folder...
copy /Y capacitor.config.ts mobile\

echo.
echo [6/7] Syncing Capacitor with Android...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed
    exit /b 1
)

echo.
echo [7/7] Opening Android project in Android Studio...
echo You can build the APK from Android Studio
echo Or run: cd android && .\gradlew assembleDebug
echo.
call npx cap open android

echo.
echo ============================================
echo Build complete!
echo ============================================
echo.
echo To build APK from command line:
echo   cd android
echo   .\gradlew assembleDebug
echo.
echo APK will be at:
echo   android\app\build\outputs\apk\debug\app-debug.apk
pause
