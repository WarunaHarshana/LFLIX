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

echo [1/6] Installing dependencies...
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo [2/6] Building web app (static export)...
set NEXT_EXPORT=1
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)

echo.
echo [3/6] Copying Capacitor config to mobile folder...
copy /Y capacitor.config.ts mobile\

echo.
echo [4/6] Syncing Capacitor with Android...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed
    exit /b 1
)

echo.
echo [5/6] Opening Android project in Android Studio...
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
