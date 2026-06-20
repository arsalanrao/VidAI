# Quick Cloudflare Tunnel — no domain required (good for Step 14 testing)
# Exposes http://127.0.0.1:8000 to a public https://*.trycloudflare.com URL
#
# Prerequisites:
#   1. ai-server running: uvicorn main:app --host 127.0.0.1 --port 8000
#   2. cloudflared installed: .\install-cloudflared.ps1
#
# After this starts, copy the https URL and set on Render:
#   PC_SERVER_URL=https://xxxx.trycloudflare.com
#   PC_API_SECRET=<same as ai-server/.env>

$ErrorActionPreference = "Stop"

function Get-CloudflaredPath {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        "${env:ProgramFiles}\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }

    throw "cloudflared not found. Run .\install-cloudflared.ps1 first, then reopen PowerShell."
}

$cloudflared = Get-CloudflaredPath

try {
    $health = Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 3
    Write-Host "Local ai-server OK: $($health.service)" -ForegroundColor Green
} catch {
    Write-Host "Start ai-server first (uvicorn on port 8000)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting quick tunnel to http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Write-Host "Copy the https://*.trycloudflare.com URL into Render PC_SERVER_URL" -ForegroundColor Yellow
Write-Host "Keep this window open while rendering." -ForegroundColor Yellow
Write-Host ""

& $cloudflared tunnel --url http://127.0.0.1:8000