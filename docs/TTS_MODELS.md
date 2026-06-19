# TTS models — VidAiPro

**Keep this file updated.** It is the source of truth for which API keys and models the project uses for narration (Step 11).

---

## Chatterbox Multilingual (fallback)

| Setting | Value |
|---------|--------|
| **Model page** | [build.nvidia.com/resembleai/chatterbox-multilingual-tts/api](https://build.nvidia.com/resembleai/chatterbox-multilingual-tts/api) |
| **Provider** | Resemble AI via NVIDIA Build (Riva gRPC) |
| **API key env var** | **`OPENAI_API_KEY`** — always use this for Chatterbox (not `NVIDIA_API_KEY`) |
| **Function ID** | `CHATTERBOX_FUNCTION_ID=ddacc747-1269-4fab-bfd9-8f593dead106` |
| **Default voice** | `Chatterbox-Multilingual.en-US.Male` |
| **gRPC host** | `grpc.nvcf.nvidia.com:443` |
| **Protocol** | Riva gRPC with metadata: `function-id`, `authorization: Bearer <OPENAI_API_KEY>` |

**Important:** The env var is named `OPENAI_API_KEY` in this project, but the value is the key from the Chatterbox model page on NVIDIA Build (Get API Key on that page). It is **not** the Magpie/Kimi/FLUX `nvapi-` key unless you deliberately use the same value in both vars.

---

## Magpie Multilingual (primary)

| Setting | Value |
|---------|--------|
| **Model page** | [build.nvidia.com/nvidia/magpie-tts-multilingual](https://build.nvidia.com/nvidia/magpie-tts-multilingual) |
| **API key env var** | **`NVIDIA_API_KEY`** (`nvapi-...`) |
| **Function ID** | `MAGPIE_FUNCTION_ID=877104f7-e885-42b9-8de8-f6e4c6303969` |
| **Default voice** | `Magpie-Multilingual.EN-US.Aria` |
| **Protocol** | NVCF HTTP: `GET /v1/audio/list_voices`, `POST /v1/audio/synthesize` |

Magpie gRPC fallback (same function ID, same `NVIDIA_API_KEY`) is used when `TTS_FALLBACK=magpie-grpc`.

---

## Pipeline order (default)

1. **Magpie HTTP** (`TTS_PROVIDER=magpie`, `NVIDIA_API_KEY`)
2. **Fallback** — depends on `TTS_FALLBACK`:
   - `magpie-grpc` — same Magpie model over gRPC (`NVIDIA_API_KEY`)
   - `chatterbox` — Chatterbox over gRPC (`OPENAI_API_KEY`)
   - `openai` — OpenAI `tts-1` (`OPENAI_API_KEY`, different API)
   - `none` — no fallback

---

## Render environment (copy checklist)

```
TTS_PROVIDER=magpie
TTS_VOICE=Magpie-Multilingual.EN-US.Aria
TTS_LANGUAGE=en-US
TTS_FALLBACK=chatterbox

NVIDIA_API_KEY=nvapi-...          # Magpie, Kimi, FLUX
OPENAI_API_KEY=...                # Chatterbox ONLY (from Chatterbox model page)

MAGPIE_FUNCTION_ID=877104f7-e885-42b9-8de8-f6e4c6303969
CHATTERBOX_FUNCTION_ID=ddacc747-1269-4fab-bfd9-8f593dead106
CHATTERBOX_VOICE=Chatterbox-Multilingual.en-US.Male
CHATTERBOX_GRPC_HOST=grpc.nvcf.nvidia.com:443
```

---

## Health checks

| URL | What it tests |
|-----|----------------|
| `/health/tts` | Primary TTS + fallback config |
| `/health/tts/voices?provider=magpie` | Magpie HTTP voices |
| `/health/tts/voices?provider=magpie-grpc` | Magpie gRPC voices |
| `/health/tts/voices?provider=chatterbox` | Chatterbox voices (`OPENAI_API_KEY`) |

---

## Code references

- Magpie + fallback orchestration: `backend/src/services/ai/tts.service.ts`
- Chatterbox gRPC: `backend/src/services/ai/chatterbox-tts.service.ts`
- Shared Riva client: `backend/src/services/ai/riva-grpc.client.ts`
