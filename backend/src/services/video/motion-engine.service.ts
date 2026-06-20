import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { MotionPreset } from '../../types/script.types.js';
import {
  FFmpegError,
  getRenderSettings,
  runFfmpeg,
} from './ffmpeg.util.js';

type MotionSegment = {
  imagePath: string;
  durationSec: number;
  motion: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'shake';
};

function segmentDuration(totalSec: number, parts: number): number {
  return Math.max(1, totalSec / parts);
}

function buildSegments(
  imagePaths: string[],
  totalDurationSec: number,
  preset: MotionPreset,
): MotionSegment[] {
  const perImage = segmentDuration(totalDurationSec, imagePaths.length);

  const motionsByPreset: Record<MotionPreset, MotionSegment['motion'][]> = {
    cinematic: ['zoom-in', 'pan-left', 'zoom-out'],
    horror: ['zoom-in', 'shake', 'zoom-out'],
    space: ['pan-right', 'zoom-in', 'pan-left'],
    history: ['zoom-in', 'pan-left', 'zoom-out'],
    mystery: ['zoom-out', 'shake', 'zoom-in'],
    epic: ['zoom-in', 'pan-right', 'zoom-out'],
    fantasy: ['zoom-in', 'pan-right', 'pan-left'],
    cyberpunk: ['pan-left', 'zoom-in', 'shake'],
  };

  const motions = motionsByPreset[preset] ?? motionsByPreset.cinematic;

  return imagePaths.map((imagePath, index) => ({
    imagePath,
    durationSec: perImage,
    motion: motions[index % motions.length]!,
  }));
}

function zoompanExpression(
  motion: MotionSegment['motion'],
  frames: number,
  width: number,
  height: number,
  fps: number,
): string {
  const zoomStep = motion === 'zoom-out' ? '-0.0015' : '0.0015';
  const startZoom = motion === 'zoom-out' ? '1.3' : '1.0';
  const endZoom = motion === 'zoom-out' ? '1.0' : '1.25';

  if (motion === 'pan-left') {
    return `z='min(${endZoom},${startZoom}+on*0.0015)':x='iw/2-(iw/zoom/2)-on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
  }

  if (motion === 'pan-right') {
    return `z='min(${endZoom},${startZoom}+on*0.0015)':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
  }

  if (motion === 'shake') {
    return `z='min(${endZoom},${startZoom}+on*${zoomStep.replace('-', '')})':x='iw/2-(iw/zoom/2)+sin(on*0.5)*8':y='ih/2-(ih/zoom/2)+cos(on*0.4)*6':d=${frames}:s=${width}x${height}:fps=${fps}`;
  }

  if (motion === 'zoom-out') {
    return `z='max(1.0,${startZoom}-on*0.002)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
  }

  return `z='min(${endZoom},${startZoom}+on*0.002)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
}

async function renderSegment(segment: MotionSegment, outputPath: string): Promise<void> {
  const settings = getRenderSettings();
  const frames = Math.max(1, Math.round(segment.durationSec * settings.fps));
  const zoompan = zoompanExpression(
    segment.motion,
    frames,
    settings.width,
    settings.height,
    settings.fps,
  );

  await runFfmpeg(
    [
      '-y',
      '-loop',
      '1',
      '-i',
      segment.imagePath,
      '-vf',
      `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=increase,crop=${settings.width}:${settings.height},zoompan=${zoompan}`,
      '-c:v',
      'libx264',
      '-preset',
      settings.preset,
      '-crf',
      settings.crf,
      '-pix_fmt',
      'yuv420p',
      '-t',
      String(segment.durationSec),
      outputPath,
    ],
    { threads: settings.ffmpegThreads },
  );
}

async function crossfadeSegments(segmentPaths: string[], outputPath: string): Promise<void> {
  if (segmentPaths.length === 1) {
    await runFfmpeg(['-y', '-i', segmentPaths[0]!, '-c', 'copy', outputPath]);
    return;
  }

  const listPath = outputPath.replace(/\.mp4$/, '_segments.txt');
  const listContent = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, `${listContent}\n`, 'utf8');

  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath,
  ]);
}

/** Disk-based scene render — avoids holding clip buffers in Node heap (Render 512 MB safe). */
export async function renderSceneMotionClipToFile(options: {
  imagePaths: string[];
  durationSec: number;
  motionPreset: MotionPreset;
  outputPath: string;
  workDir: string;
}): Promise<void> {
  if (!options.imagePaths.length) {
    throw new FFmpegError('Scene motion render requires at least one image');
  }

  await mkdir(options.workDir, { recursive: true });

  const segments = buildSegments(options.imagePaths, options.durationSec, options.motionPreset);
  const segmentPaths: string[] = [];

  for (const [index, segment] of segments.entries()) {
    const segmentPath = join(options.workDir, `seg_${index}.mp4`);
    await renderSegment(segment, segmentPath);
    segmentPaths.push(segmentPath);
  }

  await crossfadeSegments(segmentPaths, options.outputPath);
}

export async function concatSceneClipFiles(clipPaths: string[], outputPath: string): Promise<void> {
  if (!clipPaths.length) {
    throw new FFmpegError('No scene clips to concat');
  }

  const listPath = outputPath.replace(/\.mp4$/, '_concat.txt');
  const listContent = clipPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, `${listContent}\n`, 'utf8');

  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath,
  ]);
}

export async function mergeVideoAudioSubtitlesToFile(options: {
  videoPath: string;
  audioPath: string;
  subtitlePath?: string;
  outputPath: string;
}): Promise<void> {
  const settings = getRenderSettings();

  const subtitleFilter = options.subtitlePath
    ? `,subtitles=${options.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')}:force_style='FontName=Arial Bold,FontSize=28,PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=80'`
    : '';

  await runFfmpeg(
    [
      '-y',
      '-i',
      options.videoPath,
      '-i',
      options.audioPath,
      '-vf',
      `scale=${settings.width}:${settings.height}${subtitleFilter}`,
      '-c:v',
      'libx264',
      '-preset',
      settings.preset,
      '-crf',
      settings.crf,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      options.outputPath,
    ],
    { threads: settings.ffmpegThreads },
  );
}

/** @deprecated Prefer disk-based helpers for cloud render on memory-limited hosts. */
export async function renderSceneMotionClip(options: {
  imageBuffers: Buffer[];
  durationSec: number;
  motionPreset: MotionPreset;
}): Promise<Buffer> {
  const workDir = join(tmpdir(), `vidaipro-motion-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const imagePaths: string[] = [];

    for (const [index, buffer] of options.imageBuffers.entries()) {
      const imagePath = join(workDir, `img_${index}.jpg`);
      await writeFile(imagePath, buffer);
      imagePaths.push(imagePath);
    }

    const sceneClipPath = join(workDir, 'scene.mp4');
    await renderSceneMotionClipToFile({
      imagePaths,
      durationSec: options.durationSec,
      motionPreset: options.motionPreset,
      outputPath: sceneClipPath,
      workDir: join(workDir, 'segments'),
    });

    return await readFile(sceneClipPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** @deprecated Prefer concatSceneClipFiles for cloud render. */
export async function concatSceneClips(clipBuffers: Buffer[]): Promise<Buffer> {
  const workDir = join(tmpdir(), `vidaipro-concat-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const clipPaths: string[] = [];

    for (const [index, buffer] of clipBuffers.entries()) {
      const clipPath = join(workDir, `clip_${index}.mp4`);
      await writeFile(clipPath, buffer);
      clipPaths.push(clipPath);
    }

    const mergedPath = join(workDir, 'merged.mp4');
    await concatSceneClipFiles(clipPaths, mergedPath);

    return await readFile(mergedPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** @deprecated Prefer mergeVideoAudioSubtitlesToFile for cloud render. */
export async function mergeVideoAudioSubtitles(options: {
  videoBuffer: Buffer;
  audioBuffer: Buffer;
  subtitlePath?: string;
}): Promise<Buffer> {
  const workDir = join(tmpdir(), `vidaipro-final-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const videoPath = join(workDir, 'video.mp4');
    const audioPath = join(workDir, 'narration.wav');
    const outputPath = join(workDir, 'final.mp4');

    await writeFile(videoPath, options.videoBuffer);
    await writeFile(audioPath, options.audioBuffer);

    await mergeVideoAudioSubtitlesToFile({
      videoPath,
      audioPath,
      subtitlePath: options.subtitlePath,
      outputPath,
    });

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
