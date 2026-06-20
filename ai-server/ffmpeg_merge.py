"""Merge scene clips and narration audio with FFmpeg."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class FFmpegError(RuntimeError):
    pass


def _require_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise FFmpegError(
            "ffmpeg not found on PATH. Install it: winget install Gyan.FFmpeg",
        )
    return path


def concat_videos(video_paths: list[Path], output_path: Path) -> Path:
    if not video_paths:
        raise FFmpegError("No video clips to concat")

    _require_ffmpeg()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if len(video_paths) == 1:
        shutil.copy2(video_paths[0], output_path)
        return output_path

    list_file = output_path.parent / "concat_list.txt"
    lines = []
    for clip in video_paths:
        escaped = str(clip.resolve()).replace("'", "'\\''")
        lines.append(f"file '{escaped}'")

    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c",
        "copy",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FFmpegError(result.stderr[-800:] or "ffmpeg concat failed")

    return output_path


def merge_video_and_audio(
    video_path: Path,
    audio_path: Path,
    output_path: Path,
) -> Path:
    _require_ffmpeg()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FFmpegError(result.stderr[-800:] or "ffmpeg merge failed")

    return output_path
