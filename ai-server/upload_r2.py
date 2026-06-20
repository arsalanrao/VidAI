"""Upload rendered video to R2 and notify Render webhook."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


async def upload_file(
    local_path: Path,
    upload_url: str,
    *,
    content_type: str = "video/mp4",
    timeout: float = 600.0,
) -> None:
    data = local_path.read_bytes()

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.put(
            upload_url,
            content=data,
            headers={"Content-Type": content_type},
        )
        response.raise_for_status()

    logger.info("Uploaded %s (%d bytes) to R2", local_path.name, len(data))


async def notify_render_complete(
    callback_url: str,
    *,
    api_secret: str,
    project_id: str,
    video_key: str,
    ok: bool = True,
    error: str | None = None,
    timeout: float = 60.0,
) -> None:
    payload = {
        "project_id": project_id,
        "video_key": video_key,
        "ok": ok,
    }

    if error:
        payload["error"] = error

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.post(
            callback_url,
            json=payload,
            headers={
                "X-Api-Secret": api_secret,
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()

    logger.info("Render complete webhook OK for project %s", project_id)
