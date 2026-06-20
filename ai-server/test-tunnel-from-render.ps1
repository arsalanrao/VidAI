# Test PC connectivity through tunnel (run after tunnel + Render env vars are set)
param(
    [string]$RenderApi = "https://vidai-nw8e.onrender.com"
)

Write-Host "Testing Render -> PC health via $RenderApi/health/pc ..." -ForegroundColor Cyan

try {
    $result = Invoke-RestMethod "$RenderApi/health/pc" -TimeoutSec 30
    $result | ConvertTo-Json -Depth 6
    if ($result.ok) {
        Write-Host "`nStep 14 OK — Render can reach your PC renderer." -ForegroundColor Green
    } else {
        Write-Host "`nNot OK: $($result.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) { $_.ErrorDetails.Message }
}
