# Named Cloudflare Tunnel (production) — requires a domain on Cloudflare
# See docs/STEP_BY_STEP_GUIDE.md Step 14 for full instructions

$ErrorActionPreference = "Stop"
$TunnelName = "vidaipro-ai"
$ConfigDir = "$env:USERPROFILE\.cloudflared"
$ConfigPath = "$ConfigDir\config.yml"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "Run .\install-cloudflared.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host @"

Named tunnel setup (one-time):

1. Login to Cloudflare:
   cloudflared tunnel login

2. Create tunnel:
   cloudflared tunnel create $TunnelName

3. Note the tunnel UUID from the output, then edit:
   $ConfigPath

   Example config.yml:
   ---
   tunnel: <TUNNEL-UUID>
   credentials-file: $ConfigDir\<TUNNEL-UUID>.json

   ingress:
     - hostname: ai.yourdomain.com
       service: http://127.0.0.1:8000
     - service: http_status:404

4. Add DNS CNAME in Cloudflare dashboard:
   ai.yourdomain.com -> <TUNNEL-UUID>.cfargotunnel.com

5. Run tunnel:
   cloudflared tunnel run $TunnelName

6. Set on Render:
   PC_SERVER_URL=https://ai.yourdomain.com
   PC_API_SECRET=<same as ai-server/.env>

"@ -ForegroundColor Cyan

if (Test-Path $ConfigPath) {
    Write-Host "Found existing config: $ConfigPath" -ForegroundColor Green
    Write-Host "Starting named tunnel..." -ForegroundColor Cyan
    cloudflared tunnel run $TunnelName
} else {
    Write-Host "No config at $ConfigPath yet — complete steps above first." -ForegroundColor Yellow
}
