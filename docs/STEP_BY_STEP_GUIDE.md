# VidAiPro — Complete Step-by-Step Guide (Non-Technical)

**Welcome!** This document is your map for building **VidAiPro** — an app that turns a viral YouTube link into a **new** YouTube Short using AI.

Read this like a recipe book. We will finish **one step at a time**. Do not skip ahead unless the guide says you can.

---

## How to use this guide

1. Start at **Step 0** and go in order.
2. When a step says **“Your job”**, that is what **you** do on your computer or in a website.
3. When it says **“Cursor / AI job”**, tell Cursor in chat: *“Do Step X from STEP_BY_STEP_GUIDE.md”*.
4. Put a checkmark ✅ in the box when each step is done: `- [ ]` → `- [x]`.
5. If something fails, go to **Troubleshooting** at the bottom — do not guess.

---

## Table of contents

| Part | What it covers |
|------|----------------|
| [Part A — Big picture](#part-a--big-picture-what-we-are-building) | Simple explanation |
| [Part B — Things you need first](#part-b--things-you-need-before-we-start) | Accounts, hardware, money |
| [Part C — Words explained](#part-c--simple-dictionary) | Glossary |
| [Step 0 — Prepare your workspace](#step-0--prepare-your-workspace) | Install basic tools |
| [Step 1 — Accounts & API keys](#step-1--create-accounts-and-api-keys) | Sign up for services |
| [Step 2 — Hosting setup](#step-2--hostinger-hosting-setup) | Website + server |
| [Step 3 — Database & Redis](#step-3--database-and-redis-cloud) | Store app data |
| [Step 4 — File storage](#step-4--file-storage-for-videos-and-images) | Where videos live |
| [Step 5 — Backend project (Node.js)](#step-5--backend-project-on-server) | The “brain” online |
| [Step 6 — Database tables](#step-6--database-tables-prisma) | User & project storage |
| [Step 7 — API routes (basic)](#step-7--first-api-routes) | Create & check projects |
| [Step 8 — YouTube extract](#step-8--extract-youtube-transcript) | Get text from viral video |
| [Step 9 — Kimi script AI](#step-9--kimi-ai-script-writer) | New title, scenes, narration |
| [Step 10 — FLUX images](#step-10--flux-image-generation) | Thumbnails & scene pictures |
| [Step 11 — Voice (TTS)](#step-11--voice-narration-tts) | Narration audio |
| [Step 12 — Job queue](#step-12--job-queue-bullmq) | Line up work |
| [Step 13 — Local PC AI server](#step-13--local-pc-ai-server-rtx-3070) | Video from images |
| [Step 14 — Connect server to PC](#step-14--connect-online-server-to-your-pc) | Safe tunnel |
| [Step 15 — Full pipeline](#step-15--connect-everything-full-pipeline) | End-to-end test |
| [Step 16 — Mobile app](#step-16--mobile-app-screens) | Phone UI |
| [Step 17 — YouTube upload](#step-17--youtube-upload) | Publish Shorts |
| [Step 18 — Landing page](#step-18--landing-page-on-hostinger-premium) | Marketing site |
| [Step 19 — Go live checklist](#step-19--go-live-checklist) | Final checks |
| [Troubleshooting](#troubleshooting) | Common problems |

---

# Part A — Big picture (what we are building)

## What VidAiPro does (in one sentence)

You paste a **YouTube link** → the app **studies** that video → **writes a new script** → **makes new pictures and video** → **adds voice** → you **preview** → **upload** to your YouTube channel.

## Important rule

We **do not copy** the original video. We only **learn its style** (hook, pacing, topic) and make **brand new** content. That is safer and more scalable.

## Two places where the app runs

Think of it like a **restaurant**:

| Place | Real name | What it does | Analogy |
|-------|-----------|--------------|---------|
| **Online server** | Hostinger VPS + cloud APIs | Takes orders, writes scripts, makes images & voice, saves files | **Front desk & kitchen prep** |
| **Your home PC** | RTX 3070 + Python | Turns images into **moving video**, merges clips | **Special oven** (heavy GPU work) |

Your **phone app** talks to the **online server** only. The server sends **picture jobs** to your PC when it is turned on.

## Simple flow diagram

```
YOU (phone app)
    ↓ paste YouTube URL
ONLINE SERVER (Hostinger VPS)
    ↓ get transcript
    ↓ Kimi AI → new script & scene ideas
    ↓ FLUX → pictures (thumbnail + scenes)
    ↓ TTS → voice audio file
    ↓ send scene pictures to →
YOUR PC (RTX 3070)
    ↓ Stable Video Diffusion → short video clips
    ↓ FFmpeg → one final video
    ↓ send back to server
ONLINE SERVER
    ↓ you preview
    ↓ upload to YouTube
DONE 🎬
```

---

# Part B — Things you need before we start

## Hardware

| Item | Required? | Notes |
|------|-----------|-------|
| Windows PC with **NVIDIA RTX 3070** | **Yes** (for video) | 8 GB VRAM — we use efficient settings |
| PC turned on when generating video | **Yes** | Or video step waits |
| A normal computer for coding | **Yes** | Same PC is fine |
| Android or iPhone | Later (Step 16) | For testing the app |

## Software we will install (Step 0)

- **Git** — saves code versions  
- **Node.js** — runs the online backend on server & your PC for dev  
- **Python 3.10+** — runs AI on your PC  
- **FFmpeg** — merges video (on PC and server)  
- **Cursor** — you already have this (AI code editor)  
- **CUDA** drivers — so PyTorch uses your RTX 3070  

## Hosting you have / need

| Service | You have? | Used for |
|---------|-----------|----------|
| **Hostinger Premium** | ✅ Yes | **Website only** (landing page) — not the heavy backend |
| **Hostinger VPS** | ❓ Need to buy | **Backend API + workers** (~$7–15/month) |
| **Upstash Redis** | Free tier | Job queue |
| **Neon PostgreSQL** | Free tier | Database |

## Money (rough monthly)

| Item | Cost |
|------|------|
| Hostinger Premium | Already paid |
| Hostinger VPS | ~$7–15/mo |
| Upstash + Neon free tiers | $0 to start |
| NVIDIA Build API (images) | Free credits, then pay |
| Kimi / Moonshot API | ~few cents per video |
| OpenAI TTS (optional) | ~few cents per video |
| **Your PC electricity** | Video generation is free (no cloud GPU bill) |

## Accounts to create (Step 1)

You will sign up for these (all have free or trial tiers):

- [ ] NVIDIA Build — images (FLUX)  
- [ ] Moonshot AI — Kimi script writer  
- [ ] OpenAI **or** use NVIDIA Magpie — voice  
- [ ] Upstash — Redis queue  
- [ ] Neon — PostgreSQL database  
- [ ] Cloudflare — file storage (R2) + tunnel to PC  
- [ ] Google Cloud — YouTube upload (later)  
- [ ] Hostinger VPS (if not yet)  

---

# Part C — Simple dictionary

| Word | Meaning in plain English |
|------|--------------------------|
| **API** | A door on the internet programs use to talk to each other |
| **API key** | Secret password for that door — never share publicly |
| **Backend** | The hidden brain on a server |
| **Frontend / App** | What you see on your phone |
| **Database** | Filing cabinet for users and projects |
| **Redis / Queue** | Waiting line for jobs (“make video #5 next”) |
| **VPS** | A small rented computer on the internet, always on |
| **Shared hosting (Premium)** | Cheap website space — **not** for heavy AI |
| **FLUX** | AI that draws images from text |
| **Kimi** | AI that writes scripts (Moonshot) |
| **TTS** | Text-to-speech — AI voice |
| **SVD** | Stable Video Diffusion — turns image → short video |
| **FFmpeg** | Tool that sticks video clips and audio together |
| **Prisma** | Helper that talks to the database from Node.js |
| **BullMQ** | Job queue for Node.js |
| **Tunnel (Cloudflare)** | Safe private road from server to your PC without opening hacker-friendly ports |

---

# Step 0 — Prepare your workspace

**Goal:** Your computer can run code and AI.

### 0.1 Install Git

**Your job:**
1. Go to https://git-scm.com/download/win  
2. Download and install (click Next on everything default).  
3. Open **PowerShell** and type: `git --version`  
4. You should see a version number.

- [ ] Git installed

### 0.2 Install Node.js (version 22 or newer)

**Your job:**
1. Go to https://nodejs.org  
2. Download **LTS** (recommended).  
3. Install.  
4. In PowerShell: `node --version` and `npm --version`

- [ ] Node.js installed

### 0.3 Install Python 3.10 or 3.11

**Your job:**
1. Go to https://www.python.org/downloads/  
2. Install — **check “Add Python to PATH”** during install.  
3. PowerShell: `python --version`

- [ ] Python installed

### 0.4 Install FFmpeg (Windows)

**Easy way (recommended) — winget:**

**Your job:**
1. Open **PowerShell** (not Command Prompt).
2. Run exactly (note spelling: **ffmpeg**, not ffmped):
   ```powershell
   winget install Gyan.FFmpeg
   ```
3. **Close PowerShell completely** and open a **new** window (or restart Cursor).  
   This is required so Windows loads the new PATH.
4. Test:
   ```powershell
   ffmpeg -version
   ```
5. You should see `ffmpeg version 8.x` and a long list of text.

**If `ffmpeg` is “not recognized” but winget says installed:**

Run this once in PowerShell to refresh PATH without restarting:
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
ffmpeg -version
```

Or test the full path directly:
```powershell
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe" -version
```
(Version folder `8.1.1` may differ slightly after updates.)

**Manual way (if winget fails):**
1. Go to https://www.gyan.dev/ffmpeg/builds/  
2. Download **ffmpeg-release-essentials.zip**  
3. Unzip to `C:\ffmpeg`  
4. Add `C:\ffmpeg\bin` to Windows PATH (search Windows: “Environment Variables” → Path → New).  
5. Close and reopen PowerShell, then: `ffmpeg -version`

- [ ] FFmpeg installed

### 0.5 NVIDIA GPU drivers

**Your job:**
1. Open **NVIDIA GeForce Experience** or https://www.nvidia.com/drivers  
2. Update driver for RTX 3070.  
3. PowerShell: `nvidia-smi` — should show your GPU.

- [ ] GPU driver OK

### 0.6 Open project in Cursor

**Your job:**
1. Open Cursor.  
2. File → Open Folder → `d:\git\apps\VidAiPro`

- [ ] Project open in Cursor

**Tell Cursor when done:** *“Step 0 complete — verify my tools”*

---

# Step 1 — Create accounts and API keys

**Goal:** You have secret keys saved in a safe place (password manager or encrypted note — **not** in public chat).

### 1.1 NVIDIA Build (for FLUX images)

**Your job:**
1. Go to https://build.nvidia.com  
2. Sign up / log in.  
3. Click profile → **Get API Key**.  
4. Save as: `NVIDIA_API_KEY`

- [ ] NVIDIA API key saved

### 1.2 Moonshot / Kimi (for scripts)

**Your job:**
1. Go to https://platform.moonshot.ai  
2. Sign up.  
3. Create API key.  
4. Save as: `MOONSHOT_API_KEY`

- [ ] Moonshot API key saved

### 1.3 Voice — pick ONE

**Option A — OpenAI (easiest):**
1. https://platform.openai.com  
2. API key → save as `OPENAI_API_KEY`

**Option B — NVIDIA Magpie (on build.nvidia.com):**
1. Use same NVIDIA key as 1.1

- [ ] TTS provider chosen and key saved

### 1.4 Upstash Redis (job queue)

**Your job:**
1. https://upstash.com → sign up  
2. Create Redis database → region close to you  
3. Copy **Redis URL** (starts with `rediss://`)  
4. Save as: `REDIS_URL`

- [ ] Redis URL saved

### 1.5 Neon PostgreSQL (database)

**Your job:**
1. https://neon.tech → sign up  
2. New project → copy connection string  
3. Save as: `DATABASE_URL`

- [ ] Database URL saved

### 1.6 Cloudflare (storage + tunnel later)

**Your job:**
1. https://dash.cloudflare.com → sign up  
2. We will set up R2 storage in Step 4  
3. We will set up tunnel in Step 14

- [ ] Cloudflare account created

### 1.7 Make a secrets file (on your PC only)

**Cursor job:** Create `.env.example` in the project (no real secrets in Git).

**Your job:** Create a file on your desktop called `VidAiPro-SECRETS.txt` and paste:

```
NVIDIA_API_KEY=
MOONSHOT_API_KEY=
OPENAI_API_KEY=
REDIS_URL=
DATABASE_URL=
PC_API_SECRET=pick-a-long-random-password-here
```

Fill in values. **Never commit this file to GitHub.**

- [ ] Secrets file on desktop

**Tell Cursor:** *“Step 1 done — create .env.example”*

---

# Step 2 — Hostinger hosting setup

**Goal:** Know what Premium can do, and where the backend runs.

### 2.0 Can Premium alone run VidAiPro?

**No — not the full app.** Hostinger **Premium** is for websites (WordPress, PHP, static pages). It does **not** support:

- Node.js / Fastify backend
- Background job workers (BullMQ)
- FFmpeg video merging on the server
- Long jobs (5–15 minutes)

| Plan | Landing page | Node.js API | Video workers |
|------|--------------|-------------|---------------|
| **Premium (you have)** | ✅ Yes | ❌ No | ❌ No |
| **Business** (upgrade) | ✅ Yes | ⚠️ Limited Node | ❌ No FFmpeg |
| **VPS** (extra cost) | Optional | ✅ Yes | ✅ Yes (FFmpeg) |
| **Your home PC** | — | ⚠️ When PC is on | ✅ SVD (RTX 3070) |
| **Render/Railway free** | — | ⚠️ Free tier limits | ❌ Use PC for video |

**Choose ONE path below.**

---

### Path A — Recommended (Premium + VPS)

| What | Where |
|------|-------|
| Website `www` | **Premium** (keep what you pay) |
| Backend API | **Hostinger VPS** (~$7–12/mo) |

→ Continue with **Step 2.2** (buy VPS).

---

### Path B — No VPS: Premium + free cloud API + your PC

| What | Where |
|------|-------|
| Website `www` | **Premium** |
| Backend API + queue | **Render.com** or **Railway.app** (free tier) |
| Image/video AI | Cloud APIs + **your RTX 3070 PC** |

**Your job:** Sign up at https://render.com (free). We deploy the Node app there in Step 5.  
**Trade-off:** Free tier sleeps when idle; your PC must be on for video generation.

- [x] Chose **Path B** — Premium + Render + PC (no VPS for now)

**Your job (Render signup):**
1. Go to https://render.com → sign up (GitHub login is easiest).
2. You do **not** need to deploy yet — Cursor scaffolds the backend first (Step 3–5).
3. Free tier note: first request after idle may take ~30–60 seconds (service wakes up).

→ Skip Step 2.2 VPS. Go to **Step 3**.

---

### Path C — Upgrade Premium → Business (Hostinger only)

Upgrade to **Business** (~$2–4/mo more) for **managed Node.js** (max ~5 apps).

**Good for:** Small API only.  
**Still bad for:** FFmpeg, heavy workers, 15-min video jobs on shared hosting.

- [ ] Chose Path C — upgraded to Business in hPanel

→ Deploy Node app in hPanel → Websites → Node.js (Step 5). PC still does SVD.

---

### 2.1 Understand Premium vs VPS (Path A)

| | Premium (you have) | VPS (Path A) |
|--|---------------------|----------------|
| Good for | Landing page | Backend API |
| Node.js workers | ❌ | ✅ |
| Always-on jobs | ❌ | ✅ |

### 2.2 Buy Hostinger VPS (Path A only — skip if Path B or C)

**Your job:**
1. Log in to Hostinger.  
2. Buy **VPS KVM 1 or 2** (4 GB RAM minimum).  
3. Choose **Ubuntu 22.04**.  
4. Note the **IP address** and **root password**.

- [ ] VPS purchased

### 2.3 Point domain (optional but recommended)

**Your job:**
1. In Hostinger DNS:  
   - `www` → Premium hosting (landing)  
   - `api` → VPS IP address  

- [ ] DNS configured (or skip and use IP for now)

### 2.4 Premium landing (keep for later)

We will use Premium in **Step 18** for a simple homepage. Nothing to do now.

- [x] Step 2 understood (Path B selected)

**Tell Cursor:** *“Path B — Render account ready”* or *“Do Step 3”*

---

# Step 3 — Database and Redis (cloud)

**Goal:** Online filing cabinet and waiting line work.

**Cursor job:**
- Create backend folder structure  
- Add Prisma with your `DATABASE_URL`  
- Test connection  

**Your job:**
1. Give Cursor your `DATABASE_URL` and `REDIS_URL` **only in chat** (or paste into server `.env` yourself — never in GitHub).

**Success:** Cursor says “database connected”.

**Common Redis mistake:** Upstash shows a `redis-cli` command — do **not** paste that. Copy the **Rediss** connection string instead. It must look like:
`rediss://default:YOUR_PASSWORD@YOUR_HOST.upstash.io:6379`

- [x] Database connected (Neon — tables created)
- [ ] Redis connected (fix REDIS_URL in `.env` if needed)

**Tell Cursor:** *“Do Step 3 — setup Prisma and test DB”*

---

# Step 4 — File storage for videos and images

**Goal:** Videos and images have a URL on the internet (not stuck on your PC).

**Your job (Cloudflare R2):**
1. Cloudflare dashboard → **R2** → Create bucket `vidaipro`  
2. Create API token with R2 read/write  
3. Save: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`

**Cursor job:** Add upload/download helpers.

- [x] R2 bucket created
- [x] Storage code added

**After deploy:** open `/health/r2` — should show `"ok": true`. Add the same R2 env vars to **Render → Environment** if not there yet.

**Tell Cursor:** *“Do Step 5 — Kimi script service”* (or continue pipeline steps)

---

# Step 5 — Backend project on server

**Goal:** A Node.js “brain” runs in the cloud (Render for Path B, VPS for Path A).

**What we build:**
- Fastify (web server)  
- TypeScript  
- Folder structure from the blueprint  

**Cursor job:** Generate:

```
backend/
  src/
    api/routes/
    services/
    queues/
    workers/
    db/
    config/
    app.ts
  package.json
  tsconfig.json
```

**Your job:**
1. Cursor builds code locally.  
2. Later we deploy (Step 5b — Render for Path B, or VPS for Path A).

### 5b Deploy to Render (Path B — when code exists)

**Your job:**
1. Push this repo to **GitHub** (private repo recommended).
2. Render dashboard → **New** → **Blueprint** → connect repo → Render reads `render.yaml`.
3. Or **New Web Service** → connect repo → set **Root Directory** to `backend`.
4. Add **Environment Variables** (copy from your local `.env`, never commit `.env`):
   - `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `MOONSHOT_API_KEY`, `NVIDIA_API_KEY`, etc.
   - `RUN_WORKER=true` (API + queue worker in one process on free tier)
   - `NODE_ENV=production`, `PORT=10000` (Render sets PORT automatically)
5. Deploy. Open `https://YOUR-APP.onrender.com/health` — should show `{"ok":true}`.

**Trade-offs:** Free Render sleeps when idle; keep your PC on for video jobs (Step 13+).

### 5c Deploy to VPS (Path A only — when code exists)

**Your job (simplified):**
1. SSH into VPS: `ssh root@YOUR_VPS_IP`  
2. Install Node 22, PM2, Git.  
3. Clone your Git repo or upload files.  
4. Create `.env` on server with secrets.  
5. `npm install && npm run build`  
6. `pm2 start dist/app.js`

**Success:** Opening `http://YOUR_VPS_IP:3000/health` shows “ok”.

- [ ] Backend code created locally
- [ ] Backend running on VPS

**Tell Cursor:** *“Do Step 5 — scaffold Fastify backend”*

---

# Step 6 — Database tables (Prisma)

**Goal:** Save users, projects, and scenes.

**Tables:**
- **User** — email, password  
- **Project** — YouTube URL, status, final video  
- **Scene** — each scene’s prompt, image, video  

**Cursor job:** Add `schema.prisma` exactly as in blueprint + run migration.

**Your job:** None (unless Cursor asks you to run a command).

**Success:** Tables exist in Neon dashboard.

- [ ] Prisma schema applied

**Tell Cursor:** *“Do Step 6 — Prisma schema and migrate”*

---

# Step 7 — First API routes

**Goal:** App can start a project and check status.

| Route | What it does |
|-------|----------------|
| `POST /api/project/create` | Start new job |
| `GET /api/project/:id/status` | Is it done? |
| `GET /api/project/:id/result` | Get video link |

**Your job:** Test with a tool like Postman or ask Cursor to run `curl` examples.

**Success:** You get `{ "projectId": "...", "status": "processing" }`.

- [ ] Create project works
- [ ] Status works

**Tell Cursor:** *“Do Step 7 — project routes”*

---

# Step 8 — Extract YouTube transcript

**Goal:** From a YouTube URL, get title + transcript text.

**How:** Server runs `yt-dlp` or uses a transcript API.

**Your job:** Give Cursor a **test YouTube URL** (any public Short).

**Success:** Project in database has transcript text saved.

- [ ] Transcript extraction works

**Tell Cursor:** *“Do Step 8 — youtube extract service”*

---

# Step 9 — Kimi AI script writer

**Goal:** AI writes NEW title, hook, narration, scenes, thumbnail idea.

**Important:** API is `https://api.moonshot.ai/v1` — model `kimi-k2.6`.

**Output example:**
```json
{
  "title": "Scientists Fear These 5 Sea Monsters",
  "hook": "...",
  "narration": "full voiceover text...",
  "thumbnailPrompt": "...",
  "scenes": [
    { "prompt": "...", "duration": 4 }
  ]
}
```

**Your job:** Check output in database — does it read like a Short, not a copy?

- [ ] Kimi script generation works

**Tell Cursor:** *“Do Step 9 — kimi.service.ts”*

---

# Step 10 — FLUX image generation

**Goal:** Create thumbnail + one image per scene.

**API:** NVIDIA Build — `flux.2-klein-4b`

**Your job:** Look at images in R2 or URLs — are they vertical (tall) for Shorts?

- [ ] Thumbnail generated
- [ ] Scene images generated

**Tell Cursor:** *“Do Step 10 — flux.service.ts”*

---

# Step 11 — Voice narration (TTS)

**Goal:** Turn `narration` text into `narration.wav`.

**Options:** OpenAI `tts-1` or NVIDIA Magpie.

**Your job:** Listen to the WAV file — clear voice?

- [ ] Narration audio works

**Tell Cursor:** *“Do Step 11 — tts.service.ts”*

---

# Step 12 — Job queue (BullMQ)

**Goal:** Steps run in order automatically without crashing the website.

**Flow:**
1. User creates project → job added to queue  
2. Worker runs: extract → Kimi → FLUX → TTS → dispatch to PC  

**Your job:** Start worker process on VPS:
```bash
pm2 start dist/workers/pipeline.worker.js --name worker
```

- [ ] Queue processes one test project end-to-end (until PC step)

**Tell Cursor:** *“Do Step 12 — BullMQ pipeline worker”*

---

# Step 13 — Local PC AI server (RTX 3070)

**Goal:** Your PC turns each scene **image** into a **short video**.

### 13.1 Create `ai-server` folder

**Cursor job:** Create on your PC:

```
ai-server/
  main.py          # FastAPI web server
  sd_video.py      # Stable Video Diffusion
  ffmpeg_merge.py  # Merge clips + audio
  download.py      # Download images from URLs
  requirements.txt
  .env
```

### 13.2 Install Python packages

**Your job (PowerShell):**
```powershell
cd d:\git\apps\VidAiPro\ai-server
python -m venv venv
.\venv\Scripts\activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt
```

First run downloads **large** AI models (many GB). Be patient.

### 13.3 Test one image → video

**Your job:**
```powershell
uvicorn main:app --host 127.0.0.1 --port 8000
```

Ask Cursor to send a test request.

**Success:** A short `.mp4` file appears.

- [ ] Python venv created
- [ ] SVD produces a test video on 3070

**Tell Cursor:** *“Do Step 13 — ai-server with SVD for RTX 3070”*

---

# Step 14 — Connect online server to your PC

**Goal:** VPS can talk to your PC **safely** (not open to whole internet).

**Best method: Cloudflare Tunnel**

**Your job:**
1. Install `cloudflared` on Windows.  
2. Create tunnel `vidaipro-ai` → `http://localhost:8000`  
3. Get URL like `https://ai.yourdomain.com`  
4. Put in server `.env`: `PC_SERVER_URL=https://ai.yourdomain.com`  
5. Same secret: `PC_API_SECRET` on both sides  

**Success:** From VPS, health check to PC returns OK (only with secret header).

- [ ] Tunnel running
- [ ] PC server reachable from VPS

**Tell Cursor:** *“Do Step 14 — dispatcher with API key auth”*

---

# Step 15 — Connect everything (full pipeline)

**Goal:** One YouTube URL → final video file.

**Checklist:**
- [ ] Paste URL in API  
- [ ] Transcript extracted  
- [ ] Kimi script saved  
- [ ] Images in R2  
- [ ] Narration WAV in R2  
- [ ] PC received scenes  
- [ ] PC returned final MP4  
- [ ] Project status = `done`  
- [ ] You can play video in browser  

**If PC is off:** Status should say `waiting_for_renderer` — not crash.

**Tell Cursor:** *“Do Step 15 — wire full pipeline + webhook”*

---

# Step 16 — Mobile app screens

**Goal:** Phone UI for non-developers.

**Screens:**
1. **Home** — start new project  
2. **Paste URL** — enter YouTube link  
3. **Progress** — spinner + steps  
4. **Pick thumbnail** — choose 1 of 3 (if we generate 3)  
5. **Preview** — watch video  
6. **Upload** — send to YouTube  

**Your job:** Run on Android emulator or real phone:
```powershell
cd d:\git\apps\VidAiPro
npm install
npm run android
```

- [ ] App installs on phone/emulator
- [ ] App talks to `api.yourdomain.com`

**Tell Cursor:** *“Do Step 16 — mobile screens one at a time”*

---

# Step 17 — YouTube upload

**Goal:** After you approve, video goes to your channel.

**Your job:**
1. Google Cloud Console → new project  
2. Enable **YouTube Data API v3**  
3. OAuth credentials  
4. Log in with your Google account in the app  

**Success:** Video appears as **Private** on YouTube Studio first.

- [ ] Google OAuth works
- [ ] Test upload private Short

**Tell Cursor:** *“Do Step 17 — YouTube OAuth and upload”*

---

# Step 18 — Landing page on Hostinger Premium

**Goal:** Simple public website explaining the product.

**Your job:**
1. Hostinger Premium → install WordPress **or** upload static HTML.  
2. Pages: Home, Privacy, Terms.  
3. Link “Download app” or “Join waitlist”.

- [ ] www site live

**Tell Cursor:** *“Do Step 18 — simple landing HTML”* (optional)

---

# Step 19 — Go live checklist

Before real users:

- [ ] All API keys in server `.env` only — not in app code  
- [ ] `PC_API_SECRET` on PC and server  
- [ ] HTTPS on API (`api.yourdomain.com`)  
- [ ] Database backups enabled (Neon)  
- [ ] Error messages don't leak secrets  
- [ ] YouTube uploads default to **private**  
- [ ] Test with 3 different YouTube URLs  
- [ ] PC has enough disk space for temp videos  

---

# Troubleshooting

| Problem | What to try |
|---------|-------------|
| “CUDA out of memory” on PC | Close games/browser; use smaller SVD settings; one scene at a time |
| PC not reachable | Check Cloudflare tunnel is running; PC awake |
| Kimi error | Check `MOONSHOT_API_KEY`; check account balance |
| FLUX error | Check NVIDIA credits on build.nvidia.com |
| Worker not running | On VPS: `pm2 list` — restart worker |
| Video has no sound | Check narration URL passed to PC FFmpeg step |
| Video wrong shape | Must be 9:16 (1080×1920) — fix in FFmpeg scale step |
| Hostinger Premium can't run Node worker | **Expected** — use VPS |
| `ffmpeg` not found after winget install | Close terminal and reopen, or run PATH refresh command in Step 0.4 |
| Typed `ffmped` instead of `ffmpeg` | Use correct spelling: **ffmpeg** |

---

# How to work with Cursor (repeat every step)

1. Read the step here.  
2. Do **Your job** parts.  
3. Say in chat exactly:  

   > **“Please do Step [number] from docs/STEP_BY_STEP_GUIDE.md”**

4. When Cursor finishes, test what the step says.  
5. Check the box ✅.  
6. Go to next step only.

**Do not ask Cursor to do Steps 1–19 all at once.** One step = one focused session.

---

# Current progress tracker

Copy this to the top of your notes and update:

```
Hosting path: Path B (Premium + Render + PC)
Last completed step: Step 4 ✅ (R2 storage)
Next step: Push to GitHub + add R2 vars to Render, then Step 6 (Kimi script service)
Blockers: none
```

---

# Quick reference — correct API URLs (do not use wrong ones)

| Service | Correct URL |
|---------|-------------|
| Kimi | `https://api.moonshot.ai/v1` |
| NVIDIA Build | `https://integrate.api.nvidia.com/v1` (see NVIDIA docs) |
| OpenAI TTS | `https://api.openai.com/v1/audio/speech` |
| Your PC | `PC_SERVER_URL` from Cloudflare tunnel |

---

**Document version:** 1.0  
**Created for:** VidAiPro hybrid build (Hostinger + RTX 3070)  
**Next action:** Complete **Step 0**, then tell Cursor: *“Step 0 complete — verify my tools”*
