# VidAiPro AI Server (Step 13)

Local FastAPI server that turns FLUX scene **images** into **video clips** using Stable Video Diffusion (SVD), then merges them with FFmpeg.

Runs on your **RTX 3070 8 GB** Windows PC. Render.com calls it via Cloudflare Tunnel (Step 14).

---

## Prerequisites

1. **Python 3.11 or 3.12** — required for CUDA PyTorch (3.13+ / 3.14 do **not** have GPU wheels yet)
   ```powershell
   winget install Python.Python.3.12
   ```
2. **NVIDIA drivers + CUDA** — RTX 3070 with recent Game Ready / Studio driver
3. **FFmpeg on PATH** — PowerShell:
   ```powershell
   winget install Gyan.FFmpeg
   ```
4. **~15 GB free disk** — PyTorch + SVD model cache on first run

---

## Setup (PowerShell)

```powershell
cd d:\git\apps\VidAiPro\ai-server

# Use Python 3.12 (NOT 3.14 — no CUDA PyTorch wheels yet)
py -3.12 -m venv venv312
.\venv312\Scripts\activate
python --version   # must show 3.12.x

# PyTorch with CUDA 12.4 (~2.5 GB download)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

pip install -r requirements.txt

copy .env.example .env
# Edit .env — set PC_API_SECRET (same value as Render backend)
```

---

## Start server

```powershell
cd d:\git\apps\VidAiPro\ai-server
.\venv312\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

Health check (no auth):

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expect `"cuda_available": true` and your GPU name.

---

## Test: one image → video (Step 13.3)

Use a **signed image URL** from a project that reached `narration_ready`:

```powershell
$secret = "YOUR_PC_API_SECRET"
$body = @{
  image_url = "https://SIGNED-R2-URL-TO-SCENE-JPG"
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8000/render/image" `
  -Headers @{ "X-Api-Secret" = $secret } `
  -ContentType "application/json" `
  -Body $body
```

First request **downloads the SVD model** (several GB) — can take 10–30+ minutes.

Output MP4 path is in the JSON response under `video_path`. Open it in VLC or Movies & TV.

---

## Full project render (local test)

```powershell
$body = @{
  project_id = "test-project-1"
  narration_url = "https://SIGNED-R2-NARRATION-WAV"
  scenes = @(
    @{ order = 0; image_url = "https://SCENE-1-JPG"; duration = 3 },
    @{ order = 1; image_url = "https://SCENE-2-JPG"; duration = 3 }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8000/render/project" `
  -Headers @{ "X-Api-Secret" = $secret } `
  -ContentType "application/json" `
  -Body $body
```

---

## RTX 3070 tuning

Defaults in `.env` are safe for 8 GB VRAM:

| Setting | Default | Notes |
|---------|---------|--------|
| `SVD_NUM_FRAMES` | 14 | Lower = faster, less VRAM |
| `SVD_DECODE_CHUNK_SIZE` | 2 | Keep at 2 for 8 GB |
| `SVD_WIDTH` × `SVD_HEIGHT` | 576 × 1024 | 9:16 Shorts |

If you hit CUDA OOM, try `SVD_NUM_FRAMES=10` or reduce height to 896.

---

## Troubleshooting: `cuda_available: false`

| Cause | Fix |
|-------|-----|
| Python **3.14** venv | Recreate with **3.12**: `py -3.12 -m venv venv312` |
| CPU-only PyTorch (`torch x.x.x+cpu`) | Reinstall: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124` |
| Old server still running | Stop uvicorn (Ctrl+C), then restart with `venv312` |

Verify:
```powershell
.\venv312\Scripts\python.exe -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```
Expect: `2.6.0+cu124 True NVIDIA GeForce RTX 3070`

---

## Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, auth, `/health`, `/render/*` |
| `sd_video.py` | Stable Video Diffusion pipeline |
| `ffmpeg_merge.py` | Concat clips + mix narration |
| `download.py` | Fetch assets from signed URLs |

---

## Step 14 — Cloudflare Tunnel

Expose your PC to Render safely (no open ports).

```powershell
# Terminal 1 — ai-server (already running)
uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2 — quick tunnel (testing)
.\install-cloudflared.ps1   # once
.\start-tunnel-quick.ps1    # copy https://*.trycloudflare.com URL
```

Set on **Render** dashboard:

```
PC_SERVER_URL=https://xxxx.trycloudflare.com
PC_API_SECRET=<same as ai-server .env>
```

Test: `https://vidai-nw8e.onrender.com/health/pc` or `.\test-tunnel-from-render.ps1`

For production with your domain, use `.\start-tunnel.ps1` (named tunnel).

---

## Next step

**Step 15** — upload final MP4 from PC to R2 + full pipeline webhook.
