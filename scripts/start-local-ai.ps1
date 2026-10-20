param([string]$Model='qwen3:1.7b',[switch]$Pull)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$portable=Join-Path (Get-Location) '.sites-runtime/ollama/ollama.exe'
$installed=Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe'
$ollamaCommand=Get-Command ollama -ErrorAction SilentlyContinue
if(Test-Path $portable){$ollamaBinary=$portable}elseif(Test-Path $installed){$ollamaBinary=$installed}elseif($ollamaCommand){$ollamaBinary=$ollamaCommand.Source}else{throw 'Install Ollama from https://ollama.com/download/windows first.'}
New-Item -ItemType Directory -Force '.sites-runtime' | Out-Null
$env:OLLAMA_NO_CLOUD='1'
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_NUM_PARALLEL='1'
$env:OLLAMA_MAX_LOADED_MODELS='1'
try{$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3}catch{
 Start-Process -FilePath $ollamaBinary -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput '.sites-runtime/ollama-stdout.log' -RedirectStandardError '.sites-runtime/ollama-stderr.log' | Out-Null
 $available=$false
 for($attempt=0;$attempt -lt 20;$attempt++){Start-Sleep -Seconds 1;try{$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2;$available=$true;break}catch{}}
 if(-not $available){throw 'Ollama did not start. See .sites-runtime/ollama-stderr.log'}
}
if($Pull){& $ollamaBinary pull $Model;if($LASTEXITCODE -ne 0){throw 'Model download failed'}}
$tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags'
if(-not ($tags.models | Where-Object name -eq $Model)){throw "Model missing. Run: powershell -File scripts/start-local-ai.ps1 -Pull"}
@{enabled=$true;baseUrl='http://127.0.0.1:11434';model=$Model}|ConvertTo-Json|Set-Content -Encoding utf8 '.sites-runtime/local-ai.json'
Write-Output "Local AI ready: $Model. Restart npm run dev after first setup."
