# THE SCOUT NIGHT ON A SCHEDULE - registers (or removes, or runs) the Windows Task Scheduler entry
# that starts `/scout night` headless on the operator's Claude seat (spark media-training-loop,
# wave 2: "scheduled by default, by hand after a workday").
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Print            # show what would be registered; changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Install -At 22:30
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Remove
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Run               # what the task itself invokes
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Run -Dry          # the same, a dry night (rehearsal)
#
# The task runs as the logged-on user, only when that user is logged on (the seat's credentials
# are the user's), and wakes nothing. The run is fenced: the seat may only search, read, write its
# scratch, drive pipeline/scout.mts and commit knowledge/ (the skill's step 0); money is held by the
# night's own ceiling in the CLI, and --max-budget-usd bounds the seat's turns. The operator installs
# this, never an agent: registering a scheduled task is a change to the machine, not to the repo.

param(
  [switch]$Print,
  [switch]$Install,
  [switch]$Remove,
  [switch]$Run,
  [switch]$Dry,
  [string]$At = "22:30",
  [string]$Until = "06:30",
  [string]$TaskName = "Gravitone scout night"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$allowed = @(
  "WebSearch", "WebFetch", "Read", "Write", "Edit", "Glob", "Grep",
  "Bash(npx tsx pipeline/scout.mts*)", "Bash(curl -s https://collectionapi.metmuseum.org/*)",
  "Bash(yt-dlp *)", "Bash(ffmpeg *)", "Bash(mkdir *)", "Bash(rm *.vtt)",
  "Bash(git status*)", "Bash(git diff*)", "Bash(git add knowledge/*)", "Bash(git commit*)"
)

# The night's clips render locally (LTX-2.5 through ComfyUI, the free gpu.local lane). ComfyUI is
# started when it is down and left up: the night is this box's GPU user, and a cold start costs
# the first clip ~50 s of model load either way (Lynx bench, 2026-10-20).
function Confirm-Comfy {
  $url = if ($env:COMFY_URL) { $env:COMFY_URL } else { "http://127.0.0.1:8188" }
  $bat = if ($env:COMFY_BAT) { $env:COMFY_BAT } else { "C:\Users\kazda\ai\ComfyUI\run_nvidia_gpu.bat" }
  try { Invoke-RestMethod -Uri "$url/system_stats" -TimeoutSec 5 | Out-Null; return } catch {}
  if (-not (Test-Path $bat)) { Write-Output "ComfyUI is down and $bat does not exist - clips will be refused by doctor"; return }
  Start-Process -FilePath $bat -WorkingDirectory (Split-Path -Parent $bat) -WindowStyle Minimized
  for ($i = 0; $i -lt 36; $i++) {
    Start-Sleep -Seconds 5
    try { Invoke-RestMethod -Uri "$url/system_stats" -TimeoutSec 5 | Out-Null; return } catch {}
  }
  Write-Output "ComfyUI did not answer at $url within 3 minutes - clips will be refused by doctor"
}

function Invoke-Night {
  Confirm-Comfy
  $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
  if (-not $claude) { throw "claude is not on PATH for this user - install Claude Code or add it to PATH." }
  # A rehearsal points SCOUT_STORE_DIR at a temp root; its logs go there, never into foundry-out/.
  $logs = if ($env:SCOUT_STORE_DIR) { Join-Path $env:SCOUT_STORE_DIR "logs" } else { Join-Path $repo "foundry-out/scout/logs" }
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $log = Join-Path $logs ("{0}.log" -f (Get-Date -Format "yyyy-MM-dd-HHmm"))
  Set-Location $repo
  $night = if ($Dry) { "/scout night --dry --until $Until" } else { "/scout night --until $Until" }
  $argv = @("-p", $night, "--output-format", "json", "--permission-mode", "dontAsk", "--max-budget-usd", "20", "--allowed-tools") + $allowed
  # UTF-8, not the redirect operator's UTF-16: the log is read by tools and by people.
  # The task runs Windows PowerShell 5.1, where under "Stop" the first stderr line of a native
  # command merged by 2>&1 is a terminating NativeCommandError: the night would end at the CLI's
  # first warning with an empty log and exit 1. Scope "Continue" to this call, log every record as
  # text, and read the CLI's own exit code before restoring "Stop".
  $ErrorActionPreference = "Continue"
  & $claude @argv 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $log -Encoding utf8
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  exit $code
}

$self = Join-Path $PSScriptRoot "scout-schedule.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$self`" -Run -Until $Until" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 9)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

if ($Run) { Invoke-Night }
elseif ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "removed: $TaskName"
}
elseif ($Install) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Output "registered: $TaskName, daily at $At, stops launching at $Until; logs in foundry-out/scout/logs/"
}
else {
  Write-Output "task:      $TaskName"
  Write-Output "when:      daily at $At (missed runs start when the machine is next available)"
  Write-Output "runs:      powershell -NoProfile -ExecutionPolicy Bypass -File $self -Run -Until $Until   (in $repo)"
  Write-Output "seat:      claude -p `"/scout night --until $Until`" --permission-mode dontAsk --max-budget-usd 20"
  Write-Output "tools:     $($allowed -join ', ')"
  Write-Output "install:   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scout-schedule.ps1 -Install -At $At"
}
