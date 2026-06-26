import { prisma } from '../../db/client.js';
import { generateImageWithRetry } from '../ai/image-generation.service.js';
import { projectKey, uploadObject } from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { ProjectScript } from '../../types/script.types.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

export async function regenerateThumbnail(projectId: string): Promise<{ thumbnailKey: string }> {
  if (!r2Configured) {
    throw new Error('R2 not configured');
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const script = parseProjectScript(project.script);
  const thumbnailBuffer = await generateImageWithRetry(script.thumbnailPrompt);
  const thumbnailKey = projectKey(projectId, 'thumbnail.jpg');

  await uploadObject({
    key: thumbnailKey,
    body: thumbnailBuffer,
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000',
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { thumbnail: thumbnailKey, errorMessage: null },
  });

  return { thumbnailKey };
}

export async function regenerateScene(
  projectId: string,
  sceneId: string,
  options?: { promptOverride?: string; fluxStartAttempt?: number },
): Promise<{ imageKeys: string[] }> {
  if (!r2Configured) {
    throw new Error('R2 not configured');
  }

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
  });

  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const script = project?.script ? parseProjectScript(project.script) : null;
  const scriptScene = script?.scenes[scene.order];

  const prompts = options?.promptOverride
    ? [
        `${options.promptOverride}, wide establishing shot, family-friendly`,
        `${options.promptOverride}, dramatic medium shot, soft lighting`,
        `${options.promptOverride}, abstract cinematic close-up, safe for work`,
      ]
    : scriptScene?.imagePrompts ??
      [
        `${scene.prompt}, wide establishing shot`,
        `${scene.prompt}, dramatic medium shot`,
        `${scene.prompt}, intense close-up`,
      ];

  const startAttempt = options?.fluxStartAttempt ?? 2;
  const imageKeys: string[] = [];

  for (let variant = 0; variant < 3; variant += 1) {
    const imageBuffer = await generateImageWithRetry(prompts[variant] ?? scene.prompt, {
      startAttempt,
      maxAttempts: 7,
    });
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
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { imageUrl: imageKeys[0], imageUrls: imageKeys },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { errorMessage: null },
  });

  return { imageKeys };
}
