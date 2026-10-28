# THE LOCAL MODEL, UP - makes sure the Ollama daemon answers on this box before a night leans on it
# (spark scout-vision S6: the night's drafts are written by qwen3.8:27b, and the eye reads frames with
# it). If /api/tags answers, nothing is done. Otherwise `ollama serve` is started from OLLAMA_EXE
# (the install is not on PATH), detached and hidden, and left up - like ComfyUI, the daemon is this
# box's to keep; it unloads a model by itself when idle. Exits 1 with one line when it never answers.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/ollama-up.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/ollama-up.ps1 -WaitSeconds 120
#
# It starts a process and changes nothing else; it never pulls a model (doctor names a missing one).

param(
  [string]$Url = "http://127.0.0.1:11434",
  [int]$WaitSeconds = 60
)

$ErrorActionPreference = "Stop"

function Test-Ollama {
  try { Invoke-RestMethod -Uri "$Url/api/tags" -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

if (Test-Ollama) { Write-Output "ollama: up at $Url"; exit 0 }

$exe = if ($env:OLLAMA_EXE) { $env:OLLAMA_EXE } else { "C:\Users\kazda\ai\ollama\ollama.exe" }
if (-not (Test-Path $exe)) {
  Write-Output "ollama: down at $Url and $exe does not exist - set OLLAMA_EXE to ollama.exe; drafts fall to the claude CLI"
  exit 1
}

# Bind where we will ask: `serve` reads OLLAMA_HOST as its listen address, so a host that names
# another port would start a daemon this script then never finds.
$env:OLLAMA_HOST = $Url
Start-Process -FilePath $exe -ArgumentList "serve" -WorkingDirectory (Split-Path -Parent $exe) -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if (Test-Ollama) { Write-Output "ollama: started $exe serve, up at $Url"; exit 0 }
}
Write-Output "ollama: started $exe serve but $Url/api/tags did not answer within $WaitSeconds s - drafts fall to the claude CLI"
exit 1
