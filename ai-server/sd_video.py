"""Stable Video Diffusion — tuned for RTX 3070 8 GB."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import torch
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy-loaded singleton
_pipeline = None
_pipeline_model_id: str | None = None
_hf_token: str | None = None


def configure_hf_auth(token: str) -> None:
    global _hf_token
    _hf_token = token.strip()
    os.environ["HF_TOKEN"] = _hf_token
    os.environ["HUGGINGFACE_HUB_TOKEN"] = _hf_token

    try:
        from huggingface_hub import login

        login(token=_hf_token, add_to_git_credential=False)
        logger.info("Hugging Face login OK")
    except Exception as exc:
        logger.warning("Hugging Face login warning: %s", exc)


def _resolve_hf_token(explicit: str | None) -> str:
    token = (explicit or _hf_token or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN") or "").strip()
    if not token:
        raise RuntimeError(
            "HF_TOKEN not set. Accept the model license at "
            "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1 "
            "then add HF_TOKEN=hf_... to ai-server/.env and restart uvicorn.",
        )
    return token


def _get_pipeline(model_id: str, hf_token: str | None = None):
    global _pipeline, _pipeline_model_id

    if _pipeline is not None and _pipeline_model_id == model_id:
        return _pipeline

    from diffusers import StableVideoDiffusionPipeline

    token = _resolve_hf_token(hf_token)
    configure_hf_auth(token)

    logger.info("Loading SVD model %s (first run downloads several GB)...", model_id)

    try:
        pipe = StableVideoDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float16,
            variant="fp16",
            token=token,
        )
    except Exception as exc:
        message = str(exc)
        if "not in the authorized list" in message or "GatedRepoError" in type(exc).__name__:
            raise RuntimeError(
                "Hugging Face account has not accepted the SVD license yet. "
                "Log in at https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1 "
                "and click 'Agree and access repository', then retry.",
            ) from exc
        raise
    pipe.enable_model_cpu_offload()
    if hasattr(pipe.vae, "enable_slicing"):
        try:
            pipe.vae.enable_slicing()
        except NotImplementedError:
            logger.info("VAE slicing not supported for this model — skipping")
    if hasattr(pipe.vae, "enable_tiling"):
        try:
            pipe.vae.enable_tiling()
        except NotImplementedError:
            logger.info("VAE tiling not supported for this model — skipping")

    _pipeline = pipe
    _pipeline_model_id = model_id
    return _pipeline


def _frame_to_uint8_hwc(frame) -> "np.ndarray":
    """Normalize SVD output (PIL, tensor, or float array) to uint8 H×W×C."""
    import numpy as np

    if isinstance(frame, Image.Image):
        return np.asarray(frame.convert("RGB"))

    if hasattr(frame, "cpu"):
        frame = frame.cpu().numpy()

    arr = np.asarray(frame)
    if arr.ndim == 3 and arr.shape[0] in (1, 3, 4) and arr.shape[-1] not in (1, 3, 4):
        arr = np.transpose(arr, (1, 2, 0))

    if arr.dtype != np.uint8:
        if np.issubdtype(arr.dtype, np.floating) and arr.max() <= 1.0:
            arr = arr * 255.0
        arr = np.clip(arr, 0, 255).astype(np.uint8)

    return arr


def _export_frames_to_mp4(frames, output_path: Path, fps: int) -> None:
    """Write frames to MP4 without diffusers export_to_video (more stable on Windows)."""
    import numpy as np

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        import imageio.v3 as iio

        video_frames = [_frame_to_uint8_hwc(frame) for frame in frames]

        iio.imwrite(
            output_path,
            video_frames,
            fps=fps,
            codec="libx264",
            pixelformat="yuv420p",
        )
        return
    except Exception as exc:
        logger.warning("imageio export failed (%s), trying ffmpeg fallback", exc)

    from ffmpeg_merge import _require_ffmpeg
    import subprocess
    import tempfile

    _require_ffmpeg()
    temp_dir = Path(tempfile.mkdtemp(prefix="svd-frames-"))
    try:
        for index, frame in enumerate(frames):
            Image.fromarray(_frame_to_uint8_hwc(frame)).save(temp_dir / f"frame_{index:04d}.png")

        cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-i",
            str(temp_dir / "frame_%04d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr[-800:] or "ffmpeg frame export failed")
    finally:
        for file in temp_dir.glob("*"):
            file.unlink(missing_ok=True)
        temp_dir.rmdir()


def prepare_short_image(image: Image.Image, width: int = 576, height: int = 1024) -> Image.Image:
    """Resize to 9:16 Shorts-friendly dimensions (multiples of 64)."""
    rgb = image.convert("RGB")
    return rgb.resize((width, height), Image.Resampling.LANCZOS)


def image_to_video(
    image_path: Path,
    output_path: Path,
    *,
    model_id: str = "stabilityai/stable-video-diffusion-img2vid-xt-1-1",
    num_frames: int = 14,
    fps: int = 7,
    width: int = 576,
    height: int = 1024,
    decode_chunk_size: int = 2,
    motion_bucket_id: int = 127,
    noise_aug_strength: float = 0.02,
    seed: int | None = None,
    hf_token: str | None = None,
) -> Path:
    pipe = _get_pipeline(model_id, hf_token)

    image = prepare_short_image(Image.open(image_path), width, height)

    generator = None
    if seed is not None:
        generator = torch.Generator(device="cpu").manual_seed(seed)

    logger.info(
        "SVD render: %s -> %s (%d frames @ %d fps, %dx%d)",
        image_path.name,
        output_path.name,
        num_frames,
        fps,
        width,
        height,
    )

    try:
        result = pipe(
            image,
            num_frames=num_frames,
            decode_chunk_size=decode_chunk_size,
            motion_bucket_id=motion_bucket_id,
            noise_aug_strength=noise_aug_strength,
            generator=generator,
        )
        frames = result.frames[0]
        logger.info("SVD inference done, exporting %d frames to MP4", len(frames))
        _export_frames_to_mp4(frames, output_path, fps)
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return output_path


def gpu_info() -> dict:
    info = {
        "cuda_available": torch.cuda.is_available(),
        "device_name": None,
        "vram_gb": None,
    }

    if torch.cuda.is_available():
        info["device_name"] = torch.cuda.get_device_name(0)
        props = torch.cuda.get_device_properties(0)
        info["vram_gb"] = round(props.total_memory / (1024**3), 1)

    return info
