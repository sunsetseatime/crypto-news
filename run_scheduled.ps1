param(
  [switch]$SkipDiscovery,
  [switch]$SkipDefi,
  [switch]$SkipWatchlist
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = $PSScriptRoot
Set-Location $repoRoot

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Write-LogLine([string]$LogPath, [string]$Message) {
  $line = "$(Get-Date -Format s)  $Message"
  $line | Tee-Object -FilePath $LogPath -Append
}

function Find-NodePath {
  try {
    return (Get-Command node -ErrorAction Stop).Source
  } catch {
    $candidates = @(
      "$env:ProgramFiles\nodejs\node.exe",
      "$env:ProgramFiles(x86)\nodejs\node.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if ($candidates.Count -gt 0) {
      return $candidates[0]
    }
  }
  return $null
}

$logDir = Join-Path $repoRoot "reports\\logs"
Ensure-Dir $logDir
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logPath = Join-Path $logDir "scheduled_$timestamp.log"

Write-LogLine $logPath "Starting scheduled scan in $repoRoot"

$nodeExe = Find-NodePath
if (-not $nodeExe) {
  Write-LogLine $logPath "ERROR: node.exe not found. Install Node.js or ensure it's on PATH."
  exit 1
}

function Run-Node([string]$ScriptRelPath) {
  Write-LogLine $logPath "Running: $nodeExe $ScriptRelPath"
  & $nodeExe $ScriptRelPath 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Node script failed ($LASTEXITCODE): $ScriptRelPath"
  }
  Write-LogLine $logPath "OK: $ScriptRelPath"
}

try {
  if (-not $SkipDiscovery) {
    Run-Node "src\\discover.js"
  } else {
    Write-LogLine $logPath "Skipping discovery (SkipDiscovery=1)"
  }

  if (-not $SkipDefi) {
    Run-Node "src\\defi_scan.js"
  } else {
    Write-LogLine $logPath "Skipping DeFi scan (SkipDefi=1)"
  }

  if (-not $SkipWatchlist) {
    Run-Node "src\\index.js"
  } else {
    Write-LogLine $logPath "Skipping watchlist scan (SkipWatchlist=1)"
  }

  Write-LogLine $logPath "Completed scheduled scan."
  exit 0
} catch {
  Write-LogLine $logPath ("FAILED: " + $_.Exception.Message)
  exit 1
}
