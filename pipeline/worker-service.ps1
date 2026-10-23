# THE ALWAYS-ON WORKER AT LOGON - registers (or removes, or runs) the Windows Task Scheduler entry that
# keeps `node workers/runner.mts` running on this box (spark night-load-band). A night's detached jobs
# (scene clips, game assets, stats reels) wait queued until a worker drives them, the publish tick and the
# metrics refresh are the worker's timers, and so is the `load-sample` timer a night's load band is read
# from: a box without a worker runs none of it, and `pipeline/scout.mts doctor` fails a live night for it.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/worker-service.ps1 -Print       # show what would be registered; changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/worker-service.ps1 -Install
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/worker-service.ps1 -Uninstall
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/worker-service.ps1 -Run         # what the task itself invokes; also by hand
#
# The task runs as the logged-on user, only while that user is logged on (the worker drives the operator's
# ComfyUI and reads the repo's .env.local, which the worker loads for itself - lib/envFile.ts), starts at
# logon, has no execution time limit, and is restarted three times a minute apart when it exits on a
# failure. The store is the one the worker would open anyway: GRAVITONE_STORE_PATH when set, else
# foundry-out/gravitone.sqlite. The operator installs this, never an agent: registering a scheduled task is
# a change to the machine, not to the repo.

param(
  [switch]$Print,
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Run,
  [string]$TaskName = "Gravitone worker"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

# Beside the store the worker writes: a rehearsal's temp store keeps its logs out of foundry-out/.
function Get-LogDir {
  if ($env:GRAVITONE_STORE_PATH) { return Join-Path (Split-Path -Parent $env:GRAVITONE_STORE_PATH) "worker/logs" }
  return Join-Path $repo "foundry-out/worker/logs"
}

function Invoke-Worker {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { throw "node is not on PATH for this user - install Node.js or add it to PATH." }
  $logs = Get-LogDir
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $log = Join-Path $logs ("{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
  Set-Location $repo
  Add-Content -Path $log -Encoding utf8 -Value ("[worker-service] {0} starting node workers/runner.mts in {1}" -f (Get-Date -Format "s"), $repo)
  # cmd's redirect, not PowerShell's: under 5.1 a native command's stderr through 2>&1 becomes error records,
  # which $ErrorActionPreference = Stop turns into a throw on the worker's first stderr line. Appended, so a
  # restart continues the day's log; the bytes are node's own UTF-8.
  $line = "`"$node`" workers\runner.mts >> `"$log`" 2>&1"
  & cmd.exe /d /s /c "`"$line`""
  $code = $LASTEXITCODE
  Add-Content -Path $log -Encoding utf8 -Value ("[worker-service] {0} the worker exited with {1}" -f (Get-Date -Format "s"), $code)
  exit $code
}

$self = Join-Path $PSScriptRoot "worker-service.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$self`" -Run" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
# ExecutionTimeLimit zero is "no limit"; the restart policy answers a worker that exits on a failure.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

if ($Run) { Invoke-Worker }
elseif ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "removed: $TaskName"
}
elseif ($Install) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Output "registered: $TaskName, at logon of $env:USERDOMAIN\$env:USERNAME, restarted 3x a minute apart; logs in $(Get-LogDir)"
  Write-Output "start it now without logging off: Start-ScheduledTask -TaskName `"$TaskName`""
}
else {
  Write-Output "task:      $TaskName"
  Write-Output "when:      at logon of $env:USERDOMAIN\$env:USERNAME, no time limit, restarted 3x a minute apart on a failure"
  Write-Output "runs:      powershell -NoProfile -ExecutionPolicy Bypass -File $self -Run   (in $repo)"
  Write-Output "worker:    node workers/runner.mts (reads .env and .env.local itself)"
  Write-Output "logs:      $(Get-LogDir)\<date>.log"
  Write-Output "install:   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/worker-service.ps1 -Install"
}
