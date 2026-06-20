import { prisma } from '../../db/client.js';
import { downloadObject, projectKey, uploadObject } from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { MotionPreset, ProjectScript } from '../../types/script.types.js';
import { readProjectPreferences } from '../../types/project-preferences.types.js';
import { parseSceneImageKeys } from '../pipeline/flux-stage.service.js';
import {
  concatSceneClips,
  mergeVideoAudioSubtitles,
  renderSceneMotionClip,
} from '../video/motion-engine.service.js';
import { buildSceneCaptionsAss } from '../video/caption.service.js';

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

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  const sceneClips: Buffer[] = [];

  for (const [index, scene] of project.scenes.entries()) {
    const imageKeys = parseSceneImageKeys(scene);
    const imageBuffers = await Promise.all(imageKeys.map((key) => downloadObject(key)));
    const scriptScene = script.scenes[index];
    const durationSec = scene.duration || scriptScene?.duration || 4;
    const motionPreset = (scene.motionPreset ?? scriptScene?.motionPreset ?? 'cinematic') as MotionPreset;

    const clip = await renderSceneMotionClip({
      imageBuffers,
      durationSec,
      motionPreset,
    });

    sceneClips.push(clip);
  }

  const mergedVideo = await concatSceneClips(sceneClips);
  const audioBuffer = await downloadObject(project.narrationUrl);

  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const workDir = await mkdtemp(join(tmpdir(), 'vidaipro-render-'));
  const audioPath = join(workDir, 'narration.wav');

  try {
    await writeFile(audioPath, audioBuffer);

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

    const finalBuffer = await mergeVideoAudioSubtitles({
      videoBuffer: mergedVideo,
      audioBuffer,
      subtitlePath: assPath,
    });

    const videoKey = projectKey(projectId, 'final.mp4');

    await uploadObject({
      key: videoKey,
      body: finalBuffer,
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
