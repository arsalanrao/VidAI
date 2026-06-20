import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);

export const OUTPUT_WIDTH = 1536;
export const OUTPUT_HEIGHT = 2730;
export const OUTPUT_FPS = 30;

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

export async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpeg = await resolveFfmpegPath();

  try {
    await execFileAsync(ffmpeg, args, {
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
