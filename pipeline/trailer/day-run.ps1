# Start a /trailer-clip's H3 clips unattended, once the card is free. Registered as a one-shot scheduled task.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline\trailer\day-run.ps1 -Folder <folder> [-DryRun]
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline\trailer\day-run.ps1 -Folder <folder> -Register 2026-11-06T09:00
#
# Free means two readings -GapSeconds apart with ComfyUI's queue empty and the card under -MaxUtil percent: the gate from
# the music-clip skill ("Share the GPU politely"), and a job between two clips is caught by the second reading. Its
# 12 GB ceiling cannot be read straight off an idle card, because ComfyUI keeps its last models loaded (34 GB at 3%
# utilisation, 2026-11-05). So once the queue has been idle for both readings, the cached models are freed through
# ComfyUI's own /free, a thing clips.mts does too, and only then is the ceiling read. If something outside ComfyUI still holds
# the memory after -HoldMinutes, the clips start anyway: H3 has run sharing the card (10-23 min a clip, Stay Here v5).
#
# The run holds the display and the system on for as long as it lives. Display-off Modern Standby (Kernel-Power 506) is
# not system sleep and "never sleep" does not stop it: on 2026-11-06 it began 66 s into this run and H3 clips took 1022-1115 s
# instead of about 480 s. The request belongs to this process's thread, changes no Windows setting and ends with it.
# A closed lid still sleeps.
#
# The batch holds the card's lease through a sidecar (pipeline/gpu/hold.py): clips-h3.py submits one clip at a time, so a
# queue of 0 cannot tell another tenant whether this run is between clips or done. The sidecar starts once the gate above
# has passed and is told to stop after the last pass. clips-h3.py reads no lease, so a sidecar that fails costs a log line
# and nothing else. Its own output: clips\day-run-hold.log.
#
# Never stops another process. ComfyUI is started only when it is unreachable and no ComfyUI process exists.
# Output: <folder>\music-clip\clips\day-run.log, and clips\ledger.jsonl from clips-h3.py.
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [string]$Register,
  [switch]$DryRun,
  [int]$MaxUtil = 15,
  [int]$MaxUsedMiB = 12000,
  [int]$GapSeconds = 120,
  [int]$PollSeconds = 300,
  [int]$HoldMinutes = 30,
  [string]$ComfyUrl = "http://127.0.0.1:8188",
  [string]$ComfyStart = "C:\Users\kazda\ai\ComfyUI\run_nvidia_gpu.bat"
)
$ErrorActionPreference = "Continue"
$Folder = (Resolve-Path $Folder).Path
$clip = Join-Path $Folder "music-clip"
$clipsDir = Join-Path $clip "clips"
New-Item -ItemType Directory -Force -Path $clipsDir | Out-Null
$log = Join-Path $clipsDir "day-run.log"
$h3 = (Resolve-Path (Join-Path $PSScriptRoot "..\music-clip\clips-h3.py")).Path
$planFile = Join-Path $clip "clips-plan.json"

function Say([string]$m) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

if ($Register) {
  $at = [datetime]::Parse($Register)
  $name = "Trailer clips " + (Split-Path $Folder -Leaf) + " " + $at.ToString("yyyy-MM-dd HHmm")
  $args2 = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Folder `"$Folder`""
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $args2
  $trigger = New-ScheduledTaskTrigger -Once -At $at
  # StartWhenAvailable: a box that was off at the hour starts on waking. No time limit: the gate may wait for another job.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  $i = Get-ScheduledTask -TaskName $name | Get-ScheduledTaskInfo
  Write-Output ("registered '{0}', next run {1}" -f $name, $i.NextRunTime)
  exit 0
}

function Queue {
  try {
    $q = Invoke-RestMethod -Uri "$ComfyUrl/queue" -TimeoutSec 10
    return @($q.queue_running).Count + @($q.queue_pending).Count
  } catch { return -1 }
}

function Card {
  $l = & nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits | Select-Object -First 1
  $p = $l -split ",\s*"
  return @{ util = [int]$p[0]; used = [int]$p[1] }
}

function EnsureComfy {
  if ((Queue) -ge 0) { return $true }
  $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match "ComfyUI\\main\.py" }
  if ($running) { Say "ComfyUI process exists but does not answer; waiting for it"; return $false }
  if (-not (Test-Path $ComfyStart)) { Say "ComfyUI is down and $ComfyStart does not exist"; return $false }
  Say "ComfyUI is down; starting $ComfyStart"
  if (-not $DryRun) { Start-Process -FilePath $ComfyStart -WorkingDirectory (Split-Path $ComfyStart) -WindowStyle Minimized | Out-Null }
  return $false
}

Say "day run start: $Folder"
if (-not (Test-Path $planFile)) { Say "ABORT: no $planFile"; exit 2 }
$plan = Get-Content $planFile -Raw | ConvertFrom-Json
$need = @($plan | ForEach-Object { $_.id; if ($_.end) { $_.end } } | Sort-Object -Unique)
$missing = @($need | Where-Object { -not (Test-Path (Join-Path $clip "keyframes\$_.jpg")) })
if ($missing.Count) { Say ("ABORT: keyframes missing: " + ($missing -join " ")); exit 2 }
Say ("plan: {0} clips, {1} keyframes present" -f @($plan).Count, $need.Count)

if ($DryRun) {
  $c = Card
  Say ("gate reading (dry, nothing freed or started): queue {0}, utilisation {1}%, used {2} MiB" -f (Queue), $c.util, $c.used)
  & cmd /c "python -I -u `"$h3`" `"$Folder`" --plan `"$planFile`" --dry 2>&1" | Select-Object -First 1 | ForEach-Object { Say $_ }
  Say "dry run end"
  exit 0
}

Add-Type -Namespace TrailerRun -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
if ([TrailerRun.Power]::SetThreadExecutionState([uint32]2147483651) -eq 0) { Say "WARNING: the keep-awake request was refused; standby makes clips about 2x slower" }
else { Say "holding the display and system on until this run ends" }

$idleSince = $null
$heldSince = $null
while ($true) {
  if (-not (EnsureComfy)) { $idleSince = $null; Start-Sleep -Seconds 60; continue }
  $n = Queue; $c = Card
  if ($n -ne 0 -or $c.util -ge $MaxUtil) {
    Say ("busy: queue {0}, utilisation {1}%, used {2} MiB; next check in {3} s" -f $n, $c.util, $c.used, $PollSeconds)
    $idleSince = $null; $heldSince = $null
    Start-Sleep -Seconds $PollSeconds
    continue
  }
  if (-not $idleSince) {
    $idleSince = Get-Date
    Say ("idle reading 1: utilisation {0}%, used {1} MiB; second reading in {2} s" -f $c.util, $c.used, $GapSeconds)
    Start-Sleep -Seconds $GapSeconds
    continue
  }
  Say ("idle reading 2: utilisation {0}%, used {1} MiB" -f $c.util, $c.used)
  if ($c.used -lt $MaxUsedMiB) { break }
  try { Invoke-RestMethod -Method Post -Uri "$ComfyUrl/free" -ContentType "application/json" -Body '{"unload_models":true,"free_memory":true}' -TimeoutSec 30 | Out-Null } catch { Say "free refused: $_" }
  Start-Sleep -Seconds 20
  $c = Card
  Say ("after freeing ComfyUI's cached models: used {0} MiB" -f $c.used)
  if ($c.used -lt $MaxUsedMiB) { break }
  if (-not $heldSince) { $heldSince = Get-Date }
  if (((Get-Date) - $heldSince).TotalMinutes -ge $HoldMinutes) {
    Say ("{0} MiB still held outside ComfyUI after {1} min; starting anyway, sharing the card" -f $c.used, $HoldMinutes)
    break
  }
  Start-Sleep -Seconds $PollSeconds
  $idleSince = $null
}

$holdLog = Join-Path $clipsDir "day-run-hold.log"
$holdStop = Join-Path $clipsDir "day-run-hold.stop"
$hold = $null

function HoldWords {
  try { return (Get-Content -LiteralPath $holdLog -Tail 1 -ErrorAction Stop) } catch { return "no output" }
}

# Everything here is advisory to the clips: it logs through Say and returns, whatever happens. Up to 15 s, then on regardless.
function StartHold {
  try {
    Remove-Item -LiteralPath $holdStop -Force -ErrorAction SilentlyContinue
    $py = (Resolve-Path (Join-Path $PSScriptRoot "..\gpu\hold.py") -ErrorAction Stop).Path
    $tenant = "trailer-day-run/" + (Split-Path $Folder -Leaf)
    # Start-Process joins an argument array with bare spaces, so the quoting is written out. -I: as the clips are run below.
    $a = "-I -u `"$py`" --tenant `"$tenant`" --engine comfy --while-pid $PID --wait 900 --stop-file `"$holdStop`""
    $script:hold = Start-Process -FilePath "python" -ArgumentList $a -WindowStyle Hidden -RedirectStandardOutput $holdLog -RedirectStandardError "$holdLog.err" -PassThru -ErrorAction Stop
    $null = $script:hold.Handle  # .ExitCode reads empty later unless the handle was taken while it ran
    $until = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $until) {
      if ($script:hold.HasExited) {
        Say ("gpu lease not held, sidecar exit {0}: {1}; clips start anyway" -f $script:hold.ExitCode, (HoldWords))
        $script:hold = $null
        return
      }
      if ((HoldWords) -match "^hold: holding") { Say (HoldWords); return }
      Start-Sleep -Seconds 1
    }
    Say ("gpu lease not held yet after 15 s, sidecar keeps trying: {0}; clips start anyway" -f (HoldWords))
  } catch {
    Say "gpu lease sidecar did not start: $_; clips start anyway"
    $script:hold = $null
  }
}

# A stop file, not Stop-Process: that is TerminateProcess, which releases nothing. One that ignores the file ends with this process.
function StopHold {
  if (-not $script:hold) { return }
  try {
    if ($script:hold.HasExited) { Say ("gpu lease sidecar ended before the batch, exit {0}: {1}" -f $script:hold.ExitCode, (HoldWords)); return }
    Set-Content -LiteralPath $holdStop -Value "stop" -Encoding ASCII -ErrorAction Stop
    if ($script:hold.WaitForExit(15000)) { Say ("gpu lease sidecar exit {0}: {1}" -f $script:hold.ExitCode, (HoldWords)) }
    else { Say "gpu lease sidecar still running after 15 s; it ends with this process" }
    Remove-Item -LiteralPath $holdStop -Force -ErrorAction SilentlyContinue
  } catch { Say "gpu lease sidecar stop failed: $_; it ends with this process" }
}

StartHold

# clips-h3.py skips clips already on disk, so a second pass retries only what failed.
$env:PYTHONIOENCODING = "utf-8"
foreach ($pass in 1, 2) {
  Say "clips pass $pass start"
  & cmd /c "python -I -u `"$h3`" `"$Folder`" --plan `"$planFile`" >> `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Say "clips pass $pass end, exit $code"
  if ($code -eq 0) { break }
}
StopHold
Say "day run end"
