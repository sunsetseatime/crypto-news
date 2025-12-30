param(
  [string]$Time = "08:00",
  [string]$TaskName = "Crypto-News Daily Scan",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Parse-AtTime([string]$TimeValue) {
  if (-not $TimeValue) {
    throw "Time is required (format: HH:mm)."
  }

  if ($TimeValue -notmatch '^(\d{1,2}):(\d{2})$') {
    throw "Invalid time format: '$TimeValue' (expected HH:mm, e.g. 08:00)."
  }

  $hour = [int]$Matches[1]
  $minute = [int]$Matches[2]
  if ($hour -lt 0 -or $hour -gt 23 -or $minute -lt 0 -or $minute -gt 59) {
    throw "Invalid time value: '$TimeValue' (expected 00:00-23:59)."
  }

  return (Get-Date).Date.AddHours($hour).AddMinutes($minute)
}

$repoRoot = $PSScriptRoot
$runScript = Join-Path $repoRoot "run_scheduled.ps1"

if (-not (Test-Path -LiteralPath $runScript)) {
  throw "Missing $runScript (expected to be in repo root)."
}

if ($Remove) {
  try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop | Out-Null
    Write-Host "Removed scheduled task: $TaskName"
  } catch {
    Write-Host "Task not found (nothing to remove): $TaskName"
  }
  exit 0
}

$at = Parse-AtTime $Time
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
)
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

Write-Host "Scheduled task created/updated:"
Write-Host "  Name: $TaskName"
Write-Host "  When: Daily at $Time (local time)"
Write-Host "  Runs: $runScript"
Write-Host ""
Write-Host "Run now:"
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host ""
Write-Host "Remove:"
Write-Host "  .\\setup_daily_schedule.ps1 -Remove"
