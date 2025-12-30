# Create Desktop Shortcut for Crypto Scanner
$scriptPath = $PSScriptRoot
$desktop = [System.Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Crypto Scanner.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $scriptPath "Run Scanner.bat"
$shortcut.WorkingDirectory = $scriptPath
$shortcut.Description = "Crypto Watchlist Daily Scanner"
$shortcut.IconLocation = "shell32.dll,13"
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green

