Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Desktop") & "\Crypto Scanner.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
Dim repoPath
If WScript.Arguments.Count > 0 Then
  repoPath = WScript.Arguments(0)
Else
  Set fso = CreateObject("Scripting.FileSystemObject")
  repoPath = fso.GetParentFolderName(WScript.ScriptFullName)
End If
oLink.TargetPath = repoPath & "\Run Scanner.bat"
oLink.WorkingDirectory = repoPath
oLink.Description = "Crypto Watchlist Daily Scanner"
oLink.IconLocation = "shell32.dll,13"
oLink.Save
WScript.Echo "Desktop shortcut created successfully!"

