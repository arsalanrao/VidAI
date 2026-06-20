import { prisma } from '../../db/client.js';
import { generateFluxImageWithRetry } from '../ai/flux.service.js';
import {
  getSignedObjectUrl,
  projectKey,
  uploadObject,
} from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { ProjectScript, SceneScript } from '../../types/script.types.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

function sceneImagePrompts(sceneRecord: { prompt: string }, scriptScene?: SceneScript): string[] {
  if (scriptScene?.imagePrompts?.length) {
    return scriptScene.imagePrompts.slice(0, 3);
  }

  const base = sceneRecord.prompt.trim();

  return [
    `${base}, wide establishing shot, cinematic framing`,
    `${base}, dramatic medium shot, depth of field`,
    `${base}, intense close-up, emotional detail`,
  ];
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

  for (const [index, scene] of project.scenes.entries()) {
    const scriptScene = script.scenes[index];
    const prompts = sceneImagePrompts(scene, scriptScene);
    const imageKeys: string[] = [];

    for (let variant = 0; variant < 3; variant += 1) {
      const imageBuffer = await generateFluxImageWithRetry(prompts[variant] ?? prompts[0]!);
      const suffix = String.fromCharCode(97 + variant);
      const key = projectKey(
        projectId,
        'scenes',
        `${String(scene.order + 1).padStart(2, '0')}${suffix}.jpg`,
      );

      await uploadObject({
        key,
        body: imageBuffer,
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
      });

      imageKeys.push(key);
      sceneKeys.push(key);
    }

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imageUrl: imageKeys[0],
        imageUrls: imageKeys,
      },
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

export function parseSceneImageKeys(scene: {
  imageUrl: string | null;
  imageUrls: unknown;
}): string[] {
  if (Array.isArray(scene.imageUrls)) {
    return scene.imageUrls.filter((key): key is string => typeof key === 'string' && key.length > 0);
  }

  if (scene.imageUrl) {
    return [scene.imageUrl];
  }

  return [];
}
