import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { env, type CloudRenderProfile } from '../../config/env.js';

const execFileAsync = promisify(execFile);

/** Full-quality Shorts output (local dev or paid Render plans). */
export const OUTPUT_WIDTH = 1536;
export const OUTPUT_HEIGHT = 2730;
export const OUTPUT_FPS = 30;

export type RenderSettings = {
  profile: CloudRenderProfile;
  width: number;
  height: number;
  fps: number;
  preset: string;
  crf: string;
  ffmpegThreads: number;
};

export function getRenderSettings(): RenderSettings {
  if (env.cloudRenderProfile === 'low') {
    return {
      profile: 'low',
      width: 720,
      height: 1280,
      fps: 24,
      preset: 'ultrafast',
      crf: '26',
      ffmpegThreads: 1,
    };
  }

  return {
    profile: 'standard',
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    fps: OUTPUT_FPS,
    preset: 'veryfast',
    crf: '22',
    ffmpegThreads: 0,
  };
}

export class FFmpegError extends Error {
  stderr: string;

  constructor(message: string, stderr = '') {
    super(message);
    this.name = 'FFmpegError';
    this.stderr = stderr;
  }
}

export async function resolveFfmpegPath(): Promise<string> {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic ?? undefined,
    'ffmpeg',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new FFmpegError(
    'ffmpeg not found. Install ffmpeg-static or set FFMPEG_PATH on Render.',
  );
}

export async function resolveFfprobePath(): Promise<string> {
  const candidates = [
    process.env.FFPROBE_PATH,
    ffprobeStatic.path,
    'ffprobe',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new FFmpegError('ffprobe not found');
}

export async function runFfmpeg(args: string[], options?: { threads?: number }): Promise<void> {
  const ffmpeg = await resolveFfmpegPath();
  const command = [...args];

  if (options?.threads && options.threads > 0 && !command.includes('-threads')) {
    command.unshift('-threads', String(options.threads));
  }

  try {
    await execFileAsync(ffmpeg, command, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr)
        : '';

    throw new FFmpegError(stderr.slice(-1200) || 'ffmpeg command failed', stderr);
  }
}

export async function getAudioDurationSeconds(audioPath: string): Promise<number> {
  const ffprobe = await resolveFfprobePath();

  const { stdout } = await execFileAsync(
    ffprobe,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ],
    { timeout: 60_000 },
  );

  const duration = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new FFmpegError(`Could not read audio duration from ${audioPath}`);
  }

  return duration;
}

export async function checkFfmpegAvailable(): Promise<{ ok: boolean; message: string }> {
  try {
    const ffmpeg = await resolveFfmpegPath();
    const { stdout } = await execFileAsync(ffmpeg, ['-version'], { timeout: 15_000 });
    const firstLine = stdout.split('\n')[0] ?? 'ffmpeg';

    return { ok: true, message: firstLine.trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
