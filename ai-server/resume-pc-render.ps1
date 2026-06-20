# Resume PC render for a stuck project (bypasses Render PC_SERVER_URL — calls tunnel directly)
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [string]$RenderApi = "https://vidai-nw8e.onrender.com",
    [string]$PcTunnelUrl = "",
    [string]$Secret = ""
)

$ErrorActionPreference = "Stop"

function Read-DotEnvValue {
    param([string]$Key, [string]$FilePath)
    if (-not (Test-Path $FilePath)) { return "" }
    foreach ($line in Get-Content $FilePath) {
        if ($line -match "^\s*$Key\s*=\s*(.+)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ""
}

if (-not $Secret) {
    $Secret = Read-DotEnvValue "PC_API_SECRET" (Join-Path $PSScriptRoot ".env")
}
if (-not $Secret) {
    throw "PC_API_SECRET not set — pass -Secret or add to ai-server/.env"
}

if (-not $PcTunnelUrl) {
    $urlFile = Join-Path $PSScriptRoot ".pc-tunnel-url"
    if (Test-Path $urlFile) {
        $PcTunnelUrl = (Get-Content $urlFile -Raw).Trim()
    }
}
if (-not $PcTunnelUrl) {
    throw "PcTunnelUrl required — pass -PcTunnelUrl or save URL to ai-server/.pc-tunnel-url"
}

$PcTunnelUrl = $PcTunnelUrl.TrimEnd("/")
$headers = @{ "X-Api-Secret" = $Secret; "Content-Type" = "application/json" }

Write-Host "Checking PC tunnel health..." -ForegroundColor Cyan
$health = Invoke-RestMethod "$PcTunnelUrl/health/authenticated" -Headers $headers -TimeoutSec 20
Write-Host "PC OK: $($health.gpu.device_name)" -ForegroundColor Green

Write-Host "Loading project $ProjectId from Render..." -ForegroundColor Cyan
$result = Invoke-RestMethod "$RenderApi/api/project/$ProjectId/result" -TimeoutSec 30

if (-not $result.narrationUrl) { throw "Project has no narration — run cloud pipeline first" }
if (-not $result.scenes -or $result.scenes.Count -eq 0) { throw "Project has no scenes" }

Write-Host "Requesting R2 upload URL..." -ForegroundColor Cyan
$uploadInfo = Invoke-RestMethod `
    -Uri "$RenderApi/api/project/$ProjectId/request-video-upload" `
    -Headers @{ "X-Api-Secret" = $Secret }

$payload = @{
    project_id       = $ProjectId
    narration_url    = $result.narrationUrl
    video_key        = $uploadInfo.videoKey
    video_upload_url = $uploadInfo.uploadUrl
    callback_url     = "$RenderApi/api/webhooks/render-complete"
    scenes           = @(
        foreach ($scene in ($result.scenes | Sort-Object order)) {
            @{
                order     = [int]$scene.order
                image_url = $scene.imageUrl
                duration  = $scene.duration
            }
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

Write-Host "Starting PC render ($($result.scenes.Count) scenes) — reuse existing clips in outputs/$ProjectId/ ..." -ForegroundColor Yellow
Write-Host "This may take several minutes. Do not restart uvicorn." -ForegroundColor Yellow

$response = Invoke-RestMethod -Method POST `
    -Uri "$PcTunnelUrl/render/project" `
    -Headers $headers `
    -Body $payload `
    -TimeoutSec 3600

$response | ConvertTo-Json -Depth 4

$status = Invoke-RestMethod "$RenderApi/api/project/$ProjectId/status" -TimeoutSec 20
Write-Host ""
Write-Host "Project status: $($status.status)" -ForegroundColor $(if ($status.status -eq 'done') { 'Green' } else { 'Yellow' })
Write-Host "Result: $RenderApi/api/project/$ProjectId/result"
