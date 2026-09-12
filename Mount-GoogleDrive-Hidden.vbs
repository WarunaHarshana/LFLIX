Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c " & chr(34) & Replace(WScript.ScriptFullName, WScript.ScriptName, "Mount-GoogleDrive.bat") & chr(34), 0, False
Set WshShell = Nothing

