@echo off
title Create LFLIX Desktop Shortcut
color 0A
cls

echo ============================================
echo  Create LFLIX Desktop Shortcut
echo ============================================
echo.

:: Get script directory (remove trailing backslash)
cd /d "%~dp0"
set "SOURCE_DIR=%CD%"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_NAME=LFLIX.lnk"
set "TARGET_BAT=%SOURCE_DIR%\Start LFLIX.bat"

echo Source: %SOURCE_DIR%
echo Desktop: %DESKTOP%
echo.

:: Check if Start LFLIX.bat exists
if not exist "%TARGET_BAT%" (
    echo ERROR: Start LFLIX.bat not found!
    echo Expected: %TARGET_BAT%
    echo.
    pause
    goto :eof
)

echo [OK] Start LFLIX.bat found

:: Check for custom icon
set "ICON_PATH="

:: Check for custom icon
set "ICON_PATH="

if exist "%SOURCE_DIR%\lflix.ico" (
    set "ICON_PATH=%SOURCE_DIR%\lflix.ico"
    echo [OK] Found custom icon: lflix.ico
) else if exist "%SOURCE_DIR%\public\lflix.ico" (
    set "ICON_PATH=%SOURCE_DIR%\public\lflix.ico"
    echo [OK] Found custom icon: public\lflix.ico
) else if exist "%SOURCE_DIR%\public\favicon.ico" (
    set "ICON_PATH=%SOURCE_DIR%\public\favicon.ico"
    echo [OK] Found custom icon: public\favicon.ico
) else (
    echo [INFO] No custom icon found, using default
    set "ICON_PATH=%SystemRoot%\System32\SHELL32.dll,14"
)

echo.
echo Creating shortcut...
echo.

:: Create VBScript with proper icon handling
set "VBSFILE=%TEMP%\createshortcut.vbs"
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sLinkFile = "%DESKTOP%\%SHORTCUT_NAME%"
echo Set oLink = oWS.CreateShortcut(sLinkFile^)
echo oLink.TargetPath = "%TARGET_BAT%"
echo oLink.WorkingDirectory = "%SOURCE_DIR%"
echo oLink.IconLocation = "%ICON_PATH%"
echo oLink.Description = "LFLIX - Personal Media Server"
echo oLink.WindowStyle = 1
echo oLink.Save
) > "%VBSFILE%"

:: Run VBScript
cscript //nologo "%VBSFILE%" >nul 2>&1
set "VBS_ERROR=%errorlevel%"
del "%VBSFILE%" 2>nul

:: Check if shortcut was created
if exist "%DESKTOP%\%SHORTCUT_NAME%" (
    echo ============================================
    echo  SUCCESS!
    echo ============================================
    echo.
    echo Shortcut created:
    echo   %DESKTOP%\%SHORTCUT_NAME%
    echo.
    echo You can now double-click "LFLIX" on your desktop!
) else (
    echo ============================================
    echo  ERROR: Failed to create shortcut!
    echo ============================================
    echo.
    if %VBS_ERROR% neq 0 (
        echo VBScript failed with error code: %VBS_ERROR%
    )
    echo.
    echo Manual workaround:
    echo 1. Right-click on Desktop -> New -> Shortcut
    echo 2. Location: %TARGET_BAT%
    echo 3. Name it: LFLIX
)

echo.
pause
