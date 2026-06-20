import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prisma } from '../../db/client.js';
import {
  downloadObjectToFile,
  projectKey,
  uploadObject,
} from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { MotionPreset, ProjectScript } from '../../types/script.types.js';
import { readProjectPreferences } from '../../types/project-preferences.types.js';
import { parseSceneImageKeys } from '../pipeline/flux-stage.service.js';
import {
  concatSceneClipFiles,
  mergeVideoAudioSubtitlesToFile,
  renderSceneMotionClipToFile,
} from '../video/motion-engine.service.js';
import { buildSceneCaptionsAss } from '../video/caption.service.js';
import { getRenderSettings } from '../video/ffmpeg.util.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

export async function runCloudRenderStage(projectId: string): Promise<{ videoKey: string }> {
  if (!r2Configured) {
    throw new Error('R2 not configured — cannot store final video');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.narrationUrl) {
    throw new Error('Narration missing — run TTS stage first');
  }

  const script = parseProjectScript(project.script);
  const preferences = readProjectPreferences(project);
  const missingImages = project.scenes.filter((scene) => parseSceneImageKeys(scene).length === 0);

  if (missingImages.length) {
    throw new Error(`${missingImages.length} scene(s) missing images — run FLUX stage first`);
  }

  const renderSettings = getRenderSettings();
  console.log(
    `[cloud-render] ${projectId} profile=${renderSettings.profile} ${renderSettings.width}x${renderSettings.height}`,
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  const workDir = await mkdtemp(join(tmpdir(), 'vidaipro-render-'));
  const sceneClipPaths: string[] = [];
  const audioPath = join(workDir, 'narration.wav');
  const mergedPath = join(workDir, 'merged.mp4');
  const finalPath = join(workDir, 'final.mp4');

  try {
    await downloadObjectToFile(project.narrationUrl, audioPath);

    for (const [index, scene] of project.scenes.entries()) {
      const imageKeys = parseSceneImageKeys(scene);
      const sceneDir = join(workDir, `scene_${index}`);
      await mkdir(sceneDir, { recursive: true });

      const imagePaths: string[] = [];

      for (const [imageIndex, key] of imageKeys.entries()) {
        const imagePath = join(sceneDir, `img_${imageIndex}.jpg`);
        await downloadObjectToFile(key, imagePath);
        imagePaths.push(imagePath);
      }

      const scriptScene = script.scenes[index];
      const durationSec = scene.duration || scriptScene?.duration || 4;
      const motionPreset = (scene.motionPreset ?? scriptScene?.motionPreset ?? 'cinematic') as MotionPreset;
      const clipPath = join(workDir, `scene_${index}.mp4`);

      await renderSceneMotionClipToFile({
        imagePaths,
        durationSec,
        motionPreset,
        outputPath: clipPath,
        workDir: join(sceneDir, 'segments'),
      });

      sceneClipPaths.push(clipPath);
    }

    await concatSceneClipFiles(sceneClipPaths, mergedPath);

    const totalSceneDuration = project.scenes.reduce(
      (sum, scene, index) => sum + (scene.duration || script.scenes[index]?.duration || 4),
      0,
    );

    const assPath = await buildSceneCaptionsAss({
      scenes: project.scenes.map((scene, index) => ({
        narration: script.scenes[index]?.narration ?? scene.prompt,
        durationSec: scene.duration || script.scenes[index]?.duration || 4,
      })),
      totalAudioSec: totalSceneDuration,
      audioPath,
      captionStyle: preferences.captionStyle,
    });

    await mergeVideoAudioSubtitlesToFile({
      videoPath: mergedPath,
      audioPath,
      subtitlePath: assPath,
      outputPath: finalPath,
    });

    const videoKey = projectKey(projectId, 'final.mp4');

    await uploadObject({
      key: videoKey,
      body: createReadStream(finalPath),
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000',
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'done',
        videoUrl: videoKey,
        errorMessage: null,
      },
    });

    return { videoKey };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
