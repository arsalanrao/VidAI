import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { MotionPreset } from '../../types/script.types.js';
import {
  FFmpegError,
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
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
  };

  const motions = motionsByPreset[preset] ?? motionsByPreset.cinematic;

  return imagePaths.map((imagePath, index) => ({
    imagePath,
    durationSec: perImage,
    motion: motions[index % motions.length]!,
  }));
}

function zoompanExpression(motion: MotionSegment['motion'], frames: number): string {
  const zoomStep = motion === 'zoom-out' ? '-0.0015' : '0.0015';
  const startZoom = motion === 'zoom-out' ? '1.3' : '1.0';
  const endZoom = motion === 'zoom-out' ? '1.0' : '1.25';

  if (motion === 'pan-left') {
    return `z='min(${endZoom},${startZoom}+on*0.0015)':x='iw/2-(iw/zoom/2)-on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;
  }

  if (motion === 'pan-right') {
    return `z='min(${endZoom},${startZoom}+on*0.0015)':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;
  }

  if (motion === 'shake') {
    return `z='min(${endZoom},${startZoom}+on*${zoomStep.replace('-', '')})':x='iw/2-(iw/zoom/2)+sin(on*0.5)*8':y='ih/2-(ih/zoom/2)+cos(on*0.4)*6':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;
  }

  if (motion === 'zoom-out') {
    return `z='max(1.0,${startZoom}-on*0.002)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;
  }

  return `z='min(${endZoom},${startZoom}+on*0.002)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;
}

async function renderSegment(segment: MotionSegment, outputPath: string): Promise<void> {
  const frames = Math.max(1, Math.round(segment.durationSec * OUTPUT_FPS));
  const zoompan = zoompanExpression(segment.motion, frames);

  await runFfmpeg([
    '-y',
    '-loop',
    '1',
    '-i',
    segment.imagePath,
    '-vf',
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},zoompan=${zoompan}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-t',
    String(segment.durationSec),
    outputPath,
  ]);
}

async function crossfadeSegments(segmentPaths: string[], outputPath: string): Promise<void> {
  if (segmentPaths.length === 1) {
    await runFfmpeg(['-y', '-i', segmentPaths[0]!, '-c', 'copy', outputPath]);
    return;
  }

  const listPath = outputPath.replace(/\.mp4$/, '_segments.txt');
  const { writeFile } = await import('node:fs/promises');
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

export async function renderSceneMotionClip(options: {
  imageBuffers: Buffer[];
  durationSec: number;
  motionPreset: MotionPreset;
}): Promise<Buffer> {
  if (!options.imageBuffers.length) {
    throw new FFmpegError('Scene motion render requires at least one image');
  }

  const workDir = join(tmpdir(), `vidaipro-motion-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const imagePaths: string[] = [];

    for (const [index, buffer] of options.imageBuffers.entries()) {
      const imagePath = join(workDir, `img_${index}.jpg`);
      await writeFile(imagePath, buffer);
      imagePaths.push(imagePath);
    }

    const segments = buildSegments(imagePaths, options.durationSec, options.motionPreset);
    const segmentPaths: string[] = [];

    for (const [index, segment] of segments.entries()) {
      const segmentPath = join(workDir, `seg_${index}.mp4`);
      await renderSegment(segment, segmentPath);
      segmentPaths.push(segmentPath);
    }

    const sceneClipPath = join(workDir, 'scene.mp4');
    await crossfadeSegments(segmentPaths, sceneClipPath);

    return await readFile(sceneClipPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function concatSceneClips(clipBuffers: Buffer[]): Promise<Buffer> {
  if (!clipBuffers.length) {
    throw new FFmpegError('No scene clips to concat');
  }

  const workDir = join(tmpdir(), `vidaipro-concat-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const clipPaths: string[] = [];

    for (const [index, buffer] of clipBuffers.entries()) {
      const clipPath = join(workDir, `clip_${index}.mp4`);
      await writeFile(clipPath, buffer);
      clipPaths.push(clipPath);
    }

    const listPath = join(workDir, 'concat.txt');
    const listContent = clipPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n');
    await writeFile(listPath, `${listContent}\n`, 'utf8');

    const mergedPath = join(workDir, 'merged.mp4');

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
      mergedPath,
    ]);

    return await readFile(mergedPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

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

    const subtitleFilter = options.subtitlePath
      ? `,subtitles=${options.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')}:force_style='FontName=Arial Bold,FontSize=28,PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=80'`
      : '';

    await runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-vf',
      `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}${subtitleFilter}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
