import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

const YTDLP_DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

const YTDLP_BASE_ARGS = [
  '--no-playlist',
  '--extractor-args',
  'youtube:player_client=android,web',
];

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
  | { ok: true; title: string; transcript: string; source: 'captions' | 'description' | 'title' }
  | { ok: false; reason: string };

let cachedYtDlpPath: string | null | undefined;

function defaultBinPath(): string {
  return resolve(process.cwd(), 'bin', 'yt-dlp');
}

function toAbsolutePath(candidate: string): string {
  return resolve(process.cwd(), candidate);
}

async function downloadYtDlp(targetPath: string): Promise<boolean> {
  try {
    const response = await fetch(YTDLP_DOWNLOAD_URL);

    if (!response.ok) {
      return false;
    }

    await mkdir(resolve(targetPath, '..'), { recursive: true });
    await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
    await chmod(targetPath, 0o755);
    return existsSync(targetPath);
  } catch {
    return false;
  }
}

export async function ensureYtDlpPath(): Promise<string | null> {
  if (cachedYtDlpPath !== undefined) {
    return cachedYtDlpPath;
  }

  const candidates = [env.ytdlpPath, defaultBinPath()].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const absolutePath = toAbsolutePath(candidate);
    if (existsSync(absolutePath)) {
      cachedYtDlpPath = absolutePath;
      return absolutePath;
    }
  }

  const targetPath = defaultBinPath();
  const downloaded = await downloadYtDlp(targetPath);

  cachedYtDlpPath = downloaded ? targetPath : null;
  return cachedYtDlpPath;
}

export async function getYtDlpVersion(): Promise<string | null> {
  const ytdlp = await ensureYtDlpPath();

  if (!ytdlp) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(ytdlp, ['--version'], { timeout: 15_000 });
    return stdout.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
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

  const response = await fetch(track.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });

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

async function fetchSubsToDisk(ytdlp: string, youtubeUrl: string, videoId: string): Promise<string | null> {
  const outBase = resolve('/tmp', `vidaipro-${videoId}`);

  try {
    await execFileAsync(
      ytdlp,
      [
        ...YTDLP_BASE_ARGS,
        '--skip-download',
        '--write-auto-subs',
        '--write-subs',
        '--sub-langs',
        'en,en-US,en-GB',
        '--sub-format',
        'vtt',
        '--output',
        outBase,
        youtubeUrl,
      ],
      { timeout: 120_000 },
    );
  } catch {
    // yt-dlp may exit non-zero even when subs were written.
  }

  try {
    const files = await readdir('/tmp');
    const vttFile = files.find((file) => file.startsWith(`vidaipro-${videoId}`) && file.endsWith('.vtt'));

    if (!vttFile) {
      return null;
    }

    const fullPath = resolve('/tmp', vttFile);
    const text = parseVtt(await readFile(fullPath, 'utf8'));
    await unlink(fullPath).catch(() => undefined);
    return text.length >= 20 ? text : null;
  } catch {
    return null;
  }
}

function buildTitleFallback(title: string, description: string): string {
  if (description.length >= 20) {
    return description;
  }

  return `Create a viral YouTube Short inspired by this topic.\nVideo title: ${title}`;
}

export async function extractViaYtDlp(youtubeUrl: string, videoId: string): Promise<YtDlpExtractResult> {
  const ytdlp = await ensureYtDlpPath();

  if (!ytdlp) {
    return {
      ok: false,
      reason: 'yt-dlp could not be downloaded on the server',
    };
  }

  try {
    const { stdout } = await execFileAsync(
      ytdlp,
      ['-j', '--skip-download', ...YTDLP_BASE_ARGS, youtubeUrl],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const data = JSON.parse(stdout) as YtDlpJson;
    const title = data.title?.trim() || 'Untitled YouTube video';
    const description = (data.description ?? '').trim();

    let transcript = await collectCaptionText(data);
    let source: 'captions' | 'description' | 'title' = 'captions';

    if (transcript.length < 20) {
      transcript = (await fetchSubsToDisk(ytdlp, youtubeUrl, videoId)) ?? '';
    }

    if (transcript.length < 20 && description.length >= 20) {
      transcript = description;
      source = 'description';
    }

    if (transcript.length < 20) {
      transcript = buildTitleFallback(title, description);
      source = 'title';
    }

    return { ok: true, title, transcript, source };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown yt-dlp error';
    return { ok: false, reason: `yt-dlp failed: ${message}` };
  }
}

export async function isYtDlpAvailable(): Promise<boolean> {
  return (await getYtDlpVersion()) !== null;
}
