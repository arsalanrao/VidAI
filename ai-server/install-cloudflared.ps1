# Install Cloudflare Tunnel client (cloudflared) on Windows
# Run in PowerShell (may need "Run as Administrator" for winget)

$ErrorActionPreference = "Stop"

Write-Host "Installing cloudflared via winget..." -ForegroundColor Cyan
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements

Write-Host ""
Write-Host "Done. Close and reopen PowerShell, then run:" -ForegroundColor Green
Write-Host "  cloudflared --version"
Write-Host "  .\start-tunnel-quick.ps1"
