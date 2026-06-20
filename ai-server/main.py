"""VidAiPro local AI server — SVD video generation on RTX 3070."""

from __future__ import annotations

import asyncio
import logging
import shutil
import uuid
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from download import download_file
from ffmpeg_merge import FFmpegError, concat_videos, merge_video_and_audio
from sd_video import configure_hf_auth, gpu_info, image_to_video
from upload_r2 import notify_render_complete, upload_file

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ai-server")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

    pc_api_secret: str = Field(default="dev-change-me", alias="PC_API_SECRET")
    host: str = Field(default="127.0.0.1", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    output_dir: Path = Field(default=Path("./outputs"), alias="OUTPUT_DIR")
    svd_model: str = Field(
        default="stabilityai/stable-video-diffusion-img2vid-xt-1-1",
        alias="SVD_MODEL",
    )
    svd_num_frames: int = Field(default=14, alias="SVD_NUM_FRAMES")
    svd_fps: int = Field(default=7, alias="SVD_FPS")
    svd_width: int = Field(default=576, alias="SVD_WIDTH")
    svd_height: int = Field(default=1024, alias="SVD_HEIGHT")
    svd_decode_chunk_size: int = Field(default=2, alias="SVD_DECODE_CHUNK_SIZE")
    hf_token: str = Field(default="", alias="HF_TOKEN")


settings = Settings()
settings.output_dir.mkdir(parents=True, exist_ok=True)

if settings.hf_token:
    configure_hf_auth(settings.hf_token)
    logger.info("Hugging Face token loaded from %s", ENV_PATH.name)
else:
    logger.warning("HF_TOKEN missing in %s — SVD model download will fail", ENV_PATH)

app = FastAPI(title="VidAiPro AI Server", version="0.1.0")


def verify_secret(x_api_secret: Annotated[str | None, Header()] = None) -> None:
    if not x_api_secret or x_api_secret != settings.pc_api_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Secret header")


class RenderImageRequest(BaseModel):
    image_url: str
    num_frames: int | None = None
    fps: int | None = None
    seed: int | None = None


class SceneInput(BaseModel):
    order: int
    image_url: str
    duration: int = 3


class RenderProjectRequest(BaseModel):
    project_id: str
    narration_url: str | None = None
    video_key: str | None = None
    video_upload_url: str | None = None
    callback_url: str | None = None
    scenes: list[SceneInput]


def _health_payload() -> dict:
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    gpu = gpu_info()

    return {
        "ok": True,
        "service": "vidaipro-ai-server",
        "ffmpeg": ffmpeg_ok,
        "gpu": gpu,
        "svd_model": settings.svd_model,
        "huggingface_token_set": bool(settings.hf_token),
        "output_dir": str(settings.output_dir.resolve()),
    }


@app.get("/health")
def health() -> dict:
    return _health_payload()


@app.get("/health/authenticated", dependencies=[Depends(verify_secret)])
def health_authenticated() -> dict:
    """Used by Render to verify tunnel + PC_API_SECRET (Step 14)."""
    return _health_payload()


@app.post("/render/image", dependencies=[Depends(verify_secret)])
async def render_image(body: RenderImageRequest) -> dict:
    """Test endpoint: one image URL -> short MP4 (Step 13.3)."""
    job_id = uuid.uuid4().hex[:12]
    work = settings.output_dir / job_id
    work.mkdir(parents=True, exist_ok=True)

    image_path = work / "input.jpg"
    video_path = work / "scene.mp4"

    try:
        await download_file(body.image_url, image_path)

        await asyncio.to_thread(
            image_to_video,
            image_path,
            video_path,
            model_id=settings.svd_model,
            num_frames=body.num_frames or settings.svd_num_frames,
            fps=body.fps or settings.svd_fps,
            width=settings.svd_width,
            height=settings.svd_height,
            decode_chunk_size=settings.svd_decode_chunk_size,
            seed=body.seed,
            hf_token=settings.hf_token or None,
        )
    except Exception as exc:
        logger.exception("render/image failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "job_id": job_id,
        "video_path": str(video_path.resolve()),
        "message": "Open the MP4 file locally to verify SVD output",
    }


@app.post("/render/project", dependencies=[Depends(verify_secret)])
async def render_project(body: RenderProjectRequest) -> dict:
    """Full project: scene images -> clips -> concat -> optional narration (Step 15)."""
    if not body.scenes:
        raise HTTPException(status_code=400, detail="At least one scene is required")

    work = settings.output_dir / body.project_id
    work.mkdir(parents=True, exist_ok=True)

    clip_paths: list[Path] = []
    sorted_scenes = sorted(body.scenes, key=lambda scene: scene.order)

    try:
        for index, scene in enumerate(sorted_scenes):
            scene_dir = work / f"scene_{index + 1:02d}"
            scene_dir.mkdir(parents=True, exist_ok=True)

            image_path = scene_dir / "input.jpg"
            clip_path = scene_dir / "clip.mp4"

            await download_file(scene.image_url, image_path)

            await asyncio.to_thread(
                image_to_video,
                image_path,
                clip_path,
                model_id=settings.svd_model,
                num_frames=settings.svd_num_frames,
                fps=settings.svd_fps,
                width=settings.svd_width,
                height=settings.svd_height,
                decode_chunk_size=settings.svd_decode_chunk_size,
                hf_token=settings.hf_token or None,
            )

            clip_paths.append(clip_path)

        merged_path = work / "merged.mp4"
        await asyncio.to_thread(concat_videos, clip_paths, merged_path)

        final_path = work / "final.mp4"

        if body.narration_url:
            audio_path = work / "narration.wav"
            await download_file(body.narration_url, audio_path)
            await asyncio.to_thread(merge_video_and_audio, merged_path, audio_path, final_path)
        else:
            shutil.copy2(merged_path, final_path)

        video_key = body.video_key or f"projects/{body.project_id}/final.mp4"

        if body.video_upload_url:
            await upload_file(final_path, body.video_upload_url)

        if body.callback_url:
            await notify_render_complete(
                body.callback_url,
                api_secret=settings.pc_api_secret,
                project_id=body.project_id,
                video_key=video_key,
            )

    except FFmpegError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("render/project failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "project_id": body.project_id,
        "video_path": str(final_path.resolve()),
        "video_key": body.video_key or f"projects/{body.project_id}/final.mp4",
        "uploaded": bool(body.video_upload_url),
        "scene_count": len(clip_paths),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=False)
