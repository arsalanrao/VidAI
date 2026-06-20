"""Download images and audio from signed URLs (R2, etc.)."""

from __future__ import annotations

from pathlib import Path

import httpx


async def download_file(url: str, dest: Path, timeout: float = 120.0) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.get(url)
        response.raise_for_status()
        dest.write_bytes(response.content)

    return dest
