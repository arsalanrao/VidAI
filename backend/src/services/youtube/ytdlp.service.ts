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

export type YtDlpExtractResult =
  | { ok: true; title: string; transcript: string; source: 'captions' | 'description' }
  | { ok: false; reason: string };

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

function parseJson3(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };

    return (data.events ?? [])
      .flatMap((event) => event.segs ?? [])
      .map((segment) => segment.utf8 ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function parseSrv3(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCaptionBody(raw: string, ext: string): string {
  if (ext === 'json3') {
    return parseJson3(raw);
  }

  if (ext === 'srv3' || ext === 'srv2' || ext === 'srv1') {
    return parseSrv3(raw);
  }

  return parseVtt(raw);
}

function pickCaptionTrack(tracks: YtDlpCaptionTrack[] | undefined): YtDlpCaptionTrack | null {
  if (!tracks?.length) {
    return null;
  }

  const priority = ['json3', 'vtt', 'srv3', 'srv2', 'srv1'];
  for (const ext of priority) {
    const match = tracks.find((track) => track.ext === ext && track.url);
    if (match) {
      return match;
    }
  }

  return tracks.find((track) => track.url) ?? null;
}

async function fetchCaptionText(tracks: YtDlpCaptionTrack[] | undefined): Promise<string | null> {
  const track = pickCaptionTrack(tracks);

  if (!track?.url) {
    return null;
  }

  const response = await fetch(track.url);

  if (!response.ok) {
    return null;
  }

  const raw = await response.text();
  const text = parseCaptionBody(raw, track.ext ?? 'vtt');

  return text.replace(/\s+/g, ' ').trim() || null;
}

async function collectCaptionText(data: YtDlpJson): Promise<string> {
  const manualEn = await fetchCaptionText(data.subtitles?.en);
  const autoEn = await fetchCaptionText(data.automatic_captions?.en);

  if (manualEn && manualEn.length >= 20) {
    return manualEn;
  }

  if (autoEn && autoEn.length >= 20) {
    return autoEn;
  }

  for (const tracks of Object.values(data.subtitles ?? {})) {
    const text = await fetchCaptionText(tracks);
    if (text && text.length >= 20) {
      return text;
    }
  }

  for (const tracks of Object.values(data.automatic_captions ?? {})) {
    const text = await fetchCaptionText(tracks);
    if (text && text.length >= 20) {
      return text;
    }
  }

  return '';
}

export async function extractViaYtDlp(youtubeUrl: string): Promise<YtDlpExtractResult> {
  const ytdlp = resolveYtDlpPath();

  if (!ytdlp) {
    return {
      ok: false,
      reason: 'yt-dlp not installed on server (update Render Build Command to download bin/yt-dlp)',
    };
  }

  try {
    const { stdout } = await execFileAsync(
      ytdlp,
      ['-j', '--skip-download', '--no-playlist', youtubeUrl],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const data = JSON.parse(stdout) as YtDlpJson;
    const title = data.title?.trim() || 'Untitled YouTube video';
    let transcript = await collectCaptionText(data);
    let source: 'captions' | 'description' = 'captions';

    if (transcript.length < 20) {
      transcript = (data.description ?? '').trim();
      source = 'description';
    }

    if (transcript.length < 20) {
      return {
        ok: false,
        reason: 'yt-dlp ran but found no captions or description for this video',
      };
    }

    return { ok: true, title, transcript, source };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown yt-dlp error';
    return { ok: false, reason: `yt-dlp failed: ${message}` };
  }
}

export function isYtDlpAvailable(): boolean {
  return resolveYtDlpPath() !== null;
}
