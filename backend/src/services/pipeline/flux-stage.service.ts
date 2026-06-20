import { prisma } from '../../db/client.js';
import { generateFluxImageWithRetry } from '../ai/flux.service.js';
import {
  getSignedObjectUrl,
  projectKey,
  uploadObject,
} from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { ProjectScript } from '../../types/script.types.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

export async function runFluxStage(projectId: string): Promise<{
  thumbnailKey: string;
  sceneKeys: string[];
}> {
  if (!r2Configured) {
    throw new Error('R2 not configured — add R2 env vars to generate and store images');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const script = parseProjectScript(project.script);

  if (!project.scenes.length) {
    throw new Error('No scenes found — run script stage first');
  }

  const thumbnailBuffer = await generateFluxImageWithRetry(script.thumbnailPrompt);
  const thumbnailKey = projectKey(projectId, 'thumbnail.jpg');

  await uploadObject({
    key: thumbnailKey,
    body: thumbnailBuffer,
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000',
  });

  const sceneKeys: string[] = [];

  for (const scene of project.scenes) {
    const imageBuffer = await generateFluxImageWithRetry(scene.prompt);
    const key = projectKey(projectId, 'scenes', `${String(scene.order + 1).padStart(2, '0')}.jpg`);

    await uploadObject({
      key,
      body: imageBuffer,
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });

    sceneKeys.push(key);

    await prisma.scene.update({
      where: { id: scene.id },
      data: { imageUrl: key },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      thumbnail: thumbnailKey,
      status: 'images_ready',
      errorMessage: null,
    },
  });

  return { thumbnailKey, sceneKeys };
}

export async function resolveAssetUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) {
    return null;
  }

  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    return stored;
  }

  if (!r2Configured) {
    return stored;
  }

  return getSignedObjectUrl(stored);
}
