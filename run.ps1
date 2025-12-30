# Crypto Watchlist Scanner - PowerShell Launcher
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Crypto Watchlist Daily Scanner" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Change to script directory
Set-Location $PSScriptRoot

Write-Host "Starting scan..." -ForegroundColor Yellow
Write-Host ""

# Run the scanner
node src/index.js

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Scan Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Reports saved to: reports\" -ForegroundColor Cyan
Write-Host ""

# Ask if user wants to open dashboard or reports folder
$response = Read-Host "Open Dashboard (D), reports Folder (F), or None (N)?"
if ($response -eq "D" -or $response -eq "d") {
    $dashboardPath = Join-Path "reports" "Dashboard.html"
    if (Test-Path $dashboardPath) {
        Start-Process $dashboardPath
    } else {
        Start-Process explorer.exe -ArgumentList "reports"
    }
} elseif ($response -eq "F" -or $response -eq "f") {
    Start-Process explorer.exe -ArgumentList "reports"
}
