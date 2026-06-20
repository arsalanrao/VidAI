# Quick health check (server must be running)
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json

# Single-image SVD test — replace URL and secret
$secret = "YOUR_PC_API_SECRET"
$body = @{ image_url = "PASTE_SIGNED_SCENE_JPG_URL" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/render/image" `
  -Headers @{ "X-Api-Secret" = $secret } -ContentType "application/json" -Body $body
