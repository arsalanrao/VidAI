import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

type YtDlpCaptionTrack = {
  ext?: string;
  url?: string;
};

type YtDlpJson = {
  title?: string;
  description?: string;
  subtitles?: Record<string, YtDlpCaptionTrack[]>;
  automatic_captions?: Record<string, YtDlpCaptionTrack[]>;
};

function resolveYtDlpPath(): string | null {
  const candidates = [
    env.ytdlpPath,
    resolve(process.cwd(), 'bin', 'yt-dlp'),
    resolve(process.cwd(), 'bin', 'yt-dlp.exe'),
    'yt-dlp',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'yt-dlp' || existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseVtt(vtt: string): string {
  return vtt
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('WEBVTT') &&
        !trimmed.includes('-->') &&
        !/^\d+$/.test(trimmed)
      );
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickCaptionUrl(tracks: YtDlpCaptionTrack[] | undefined): string | null {
  if (!tracks?.length) {
    return null;
  }

  const preferred = tracks.find((track) => track.ext === 'vtt' || track.ext === 'srv3' || track.ext === 'json3');
  return (preferred ?? tracks[0])?.url ?? null;
}

async function fetchCaptionText(tracks: YtDlpCaptionTrack[] | undefined): Promise<string | null> {
  const url = pickCaptionUrl(tracks);

  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const raw = await response.text();
  const text = url.includes('fmt=json3') ? raw : parseVtt(raw);

  return text.replace(/\s+/g, ' ').trim() || null;
}

export async function extractViaYtDlp(youtubeUrl: string): Promise<{ title: string; transcript: string } | null> {
  const ytdlp = resolveYtDlpPath();

  if (!ytdlp) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(ytdlp, ['-j', '--skip-download', youtubeUrl], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });

    const data = JSON.parse(stdout) as YtDlpJson;
    const title = data.title?.trim() || 'Untitled YouTube video';

    const manualEn = await fetchCaptionText(data.subtitles?.en);
    const autoEn = await fetchCaptionText(data.automatic_captions?.en);

    let transcript = manualEn || autoEn || '';

    if (transcript.length < 20) {
      for (const tracks of Object.values(data.subtitles ?? {})) {
        const text = await fetchCaptionText(tracks);
        if (text && text.length >= 20) {
          transcript = text;
          break;
        }
      }
    }

    if (transcript.length < 20) {
      for (const tracks of Object.values(data.automatic_captions ?? {})) {
        const text = await fetchCaptionText(tracks);
        if (text && text.length >= 20) {
          transcript = text;
          break;
        }
      }
    }

    if (transcript.length < 20) {
      transcript = (data.description ?? '').trim();
    }

    if (transcript.length < 20) {
      return null;
    }

    return { title, transcript };
  } catch {
    return null;
  }
}

export function isYtDlpAvailable(): boolean {
  return resolveYtDlpPath() !== null;
}
