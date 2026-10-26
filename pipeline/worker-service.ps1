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
  $stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
  $log = Join-Path $logs ("{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
  $out = Join-Path $logs ("{0}.out.log" -f $stamp)
  $err = Join-Path $logs ("{0}.err.log" -f $stamp)
  Set-Location $repo
  # The local eye and the night's drafts read OLLAMA_HOST (spark scout-vision S6). Unset, both route past the
  # daemon - the eye fell to Gemini a whole night with Ollama installed (2026-10-26 digest). It defaults to the local
  # daemon ONLY when that answers now: a set host with nothing behind it would fail a call before each re-route.
  # Read once, at start: a daemon started later (pipeline/ollama-up.ps1) reaches this worker on its next start.
  $ollama = "http://127.0.0.1:11434"
  # Start the daemon first (Director, S6 integration): the worker reads the host once, so a daemon the night script
  # starts later would never reach it.
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "pipeline\ollama-up.ps1") | Out-Null } catch {}
  if (-not $env:OLLAMA_HOST) {
    try { Invoke-RestMethod -Uri "$ollama/api/tags" -TimeoutSec 3 | Out-Null; $env:OLLAMA_HOST = $ollama } catch {}
  }
  $ollamaNote = if ($env:OLLAMA_HOST) { "OLLAMA_HOST=$env:OLLAMA_HOST" } else { "OLLAMA_HOST unset (no daemon answered at $ollama)" }
  Add-Content -Path $log -Encoding utf8 -Value ("[worker-service] {0} {1}" -f (Get-Date -Format "s"), $ollamaNote)
  Add-Content -Path $log -Encoding utf8 -Value ("[worker-service] {0} starting node workers/runner.mts in {1} (output {2})" -f (Get-Date -Format "s"), $repo, (Split-Path -Leaf $out))
  # Start-Process, not a native call: under 5.1 a native command's stderr through 2>&1 becomes error records,
  # which $ErrorActionPreference = Stop turns into a throw on the worker's first stderr line - and a cmd /c line
  # quoting "C:\Program Files\nodejs\node.exe" reached cmd with its quotes doubled ("'""C:\Program' is not
  # recognized", 2026-10-23). Start-Process takes the program and its arguments apart, so nothing is re-quoted.
  # One output pair a start (Start-Process overwrites, never appends); the day's log lists every start and exit.
  $p = Start-Process -FilePath $node -ArgumentList "workers\runner.mts" -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $code = $p.ExitCode
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
