@echo off
title Create LocalFlix Shortcut
color 0A

echo ==========================================
echo    Create LocalFlix Desktop Shortcut
echo ==========================================
echo.

set "SOURCE_DIR=%~dp0"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_NAME=LocalFlix.lnk"

:: Create VBScript to make shortcut
set "VBSFILE=%TEMP%\createshortcut.vbs"
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sLinkFile = "%DESKTOP%\%SHORTCUT_NAME%"
echo Set oLink = oWS.CreateShortcut(sLinkFile^)
echo oLink.TargetPath = "%SOURCE_DIR%Start LocalFlix.bat"
echo oLink.WorkingDirectory = "%SOURCE_DIR%"
echo oLink.IconLocation = "%SystemRoot%\System32\SHELL32.dll,14"
echo oLink.Description = "LocalFlix - Personal Media Server"
echo oLink.Save
) > "%VBSFILE%"

:: Run VBScript
cscript //nologo "%VBSFILE%"
del "%VBSFILE%"

if exist "%DESKTOP%\%SHORTCUT_NAME%" (
    echo SUCCESS! Shortcut created on your Desktop.
    echo.
    echo You can now double-click "LocalFlix" on your desktop to start!
) else (
    echo ERROR: Failed to create shortcut.
)

echo.
pause
