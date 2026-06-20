# Upload an already-rendered final.mp4 (stuck "rendering" project) to R2 and mark done
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [string]$RenderApi = "https://vidai-nw8e.onrender.com",
    [string]$Secret = "change-me-to-a-long-random-string",
    [string]$VideoPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $VideoPath) {
    $VideoPath = Join-Path $PSScriptRoot "outputs\$ProjectId\final.mp4"
}

if (-not (Test-Path $VideoPath)) {
    Write-Host "Video not found: $VideoPath" -ForegroundColor Red
    exit 1
}

Write-Host "Requesting upload URL for $ProjectId ..." -ForegroundColor Cyan
$uploadInfo = Invoke-RestMethod `
    -Uri "$RenderApi/api/project/$ProjectId/request-video-upload" `
    -Headers @{ "X-Api-Secret" = $Secret }

Write-Host "Uploading $VideoPath to R2 ..." -ForegroundColor Cyan
$bytes = [System.IO.File]::ReadAllBytes($VideoPath)
Invoke-RestMethod -Method PUT -Uri $uploadInfo.uploadUrl -Body $bytes -ContentType "video/mp4"

Write-Host "Notifying Render webhook ..." -ForegroundColor Cyan
$webhookBody = @{
    project_id = $ProjectId
    video_key  = $uploadInfo.videoKey
    ok         = $true
} | ConvertTo-Json

$result = Invoke-RestMethod -Method POST `
    -Uri "$RenderApi/api/webhooks/render-complete" `
    -Headers @{ "X-Api-Secret" = $Secret } `
    -ContentType "application/json" `
    -Body $webhookBody

$result | ConvertTo-Json -Depth 4
Write-Host "`nDone — check: $RenderApi/api/project/$ProjectId/result" -ForegroundColor Green
