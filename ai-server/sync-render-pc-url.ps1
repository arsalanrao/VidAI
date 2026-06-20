# Print current tunnel URL and steps to sync Render PC_SERVER_URL
param(
    [string]$RenderApi = "https://vidai-nw8e.onrender.com"
)

$ErrorActionPreference = "Stop"
$urlFile = Join-Path $PSScriptRoot ".pc-tunnel-url"

if (-not (Test-Path $urlFile)) {
    Write-Host "No .pc-tunnel-url file — start tunnel first:" -ForegroundColor Red
    Write-Host "  .\start-tunnel-quick.ps1"
    exit 1
}

$tunnelUrl = (Get-Content $urlFile -Raw).Trim().TrimEnd("/")
Write-Host ""
Write-Host "Current tunnel URL:" -ForegroundColor Cyan
Write-Host "  $tunnelUrl"
Write-Host ""
Write-Host "Update on Render (vidaipro-api -> Environment):" -ForegroundColor Yellow
Write-Host "  PC_SERVER_URL=$tunnelUrl"
Write-Host "  Save and deploy (or Save and deploy without rebuild)"
Write-Host ""

try {
    $health = Invoke-RestMethod "$tunnelUrl/health" -TimeoutSec 15
    Write-Host "Local tunnel health: OK ($($health.gpu.device_name))" -ForegroundColor Green
} catch {
    Write-Host "Local tunnel health: FAILED — is cloudflared still running?" -ForegroundColor Red
}

Write-Host ""
Write-Host "After updating Render, test:" -ForegroundColor Cyan
Write-Host "  Invoke-RestMethod '$RenderApi/health/pc'"
