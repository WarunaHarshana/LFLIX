Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & Replace(WScript.ScriptFullName, WScript.ScriptName, "Mount-GoogleDrive.bat") & chr(34), 0
Set WshShell = Nothing
