# Start the isolated AWS test worker using the existing browser-login profile.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:AWS_PROFILE = 'larple'
$env:AWS_DEFAULT_REGION = 'us-east-1'
$env:LARP_JUDGE_MODE = 'aws'
$env:LARP_STORAGE_DIR = Join-Path $PSScriptRoot 'storage-aws-test'
$env:LARP_AWS_REGION = 'us-east-1'
$env:LARP_AWS_QUESTION_MODEL = 'amazon.nova-micro-v1:0'
$env:LARP_AWS_ACCURACY_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
$env:LARP_AWS_ACCURACY_FALLBACK_MODEL = 'amazon.nova-pro-v1:0'
$env:LARP_AWS_VIDEO_MODEL = 'twelvelabs.pegasus-1-2-v1:0'
$env:LARP_AWS_VIDEO_REGION = 'us-east-1'
& (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -m app.worker
exit $LASTEXITCODE
