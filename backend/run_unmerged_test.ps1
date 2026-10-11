param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('api', 'worker', 'frontend')]
    [string]$Service
)

$ErrorActionPreference = 'Stop'
$env:AWS_PROFILE = 'larple'
$env:AWS_DEFAULT_REGION = 'us-east-1'
$env:LARP_JUDGE_MODE = 'aws'
$env:LARP_STORAGE_DIR = Join-Path $PSScriptRoot 'storage-unmerged-test'
$env:LARP_ALLOW_DAY_OVERRIDE = 'true'
$env:LARP_CORS_ORIGINS = '["http://localhost:5175"]'
$env:LARP_AWS_REGION = 'us-east-1'
$env:LARP_AWS_QUESTION_MODEL = 'amazon.nova-micro-v1:0'
$env:LARP_AWS_ACCURACY_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
$env:LARP_AWS_ACCURACY_FALLBACK_MODEL = 'amazon.nova-pro-v1:0'
$env:LARP_AWS_VIDEO_MODEL = 'twelvelabs.pegasus-1-2-v1:0'
$env:LARP_AWS_VIDEO_REGION = 'us-east-1'
$env:LARP_AWS_VIDEO_FALLBACK_MODEL = ''
$env:LARP_AWS_VIDEO_FALLBACK_REGION = ''

if ($Service -eq 'frontend') {
    Set-Location -LiteralPath (Join-Path $PSScriptRoot '../frontend')
    $env:VITE_API_URL = 'http://localhost:8001'
    & npm.cmd run dev -- --port 5175 --strictPort
} else {
    Set-Location -LiteralPath $PSScriptRoot
    $python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    if ($Service -eq 'api') {
        & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
    } else {
        & $python -m app.worker
    }
}
exit $LASTEXITCODE
