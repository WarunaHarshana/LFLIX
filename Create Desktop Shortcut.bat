@echo off
title Create LocalFlix Shortcut
color 0A
cls

echo ============================================
echo  Create LocalFlix Desktop Shortcut
echo ============================================
echo.

:: Get script directory (remove trailing backslash)
set "SOURCE_DIR=%~dp0"
set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_NAME=LocalFlix.lnk"
set "TARGET_BAT=%SOURCE_DIR%\Start LocalFlix.bat"

echo Source: %SOURCE_DIR%
echo Desktop: %DESKTOP%
echo.

:: Check if Start LocalFlix.bat exists
if not exist "%TARGET_BAT%" (
    echo ERROR: Start LocalFlix.bat not found!
    pause
    exit /b 1
)

:: Check for custom icon
set "ICON_PATH="
if exist "%SOURCE_DIR%\public\favicon.ico" (
    set "ICON_PATH=%SOURCE_DIR%\public\favicon.ico"
    echo [OK] Found custom icon: favicon.ico
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
echo oLink.Description = "LocalFlix - Personal Media Server"
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
    if defined ICON_PATH (
        if not "%ICON_PATH%"=="%SystemRoot%\System32\SHELL32.dll,14" (
            echo Custom icon applied! ^(favicon.ico^)
        ) else (
            echo Using default Windows icon
        )
    )
    echo.
    echo You can now double-click "LocalFlix" on your desktop!
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
    echo 3. Name it: LocalFlix
)

echo.
pause
