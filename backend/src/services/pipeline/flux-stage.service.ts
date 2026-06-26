import { prisma } from '../../db/client.js';
import {
  generateImageWithRetry,
  FLUX_MAX_ATTEMPTS,
  FluxContentFilteredError,
  FluxSceneFilteredError,
} from '../ai/image-generation.service.js';
import {
  getSignedObjectUrl,
  projectKey,
  uploadObject,
} from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { ProjectScript, SceneScript } from '../../types/script.types.js';

import { getRecoveryMeta } from './pipeline-recovery.service.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

function rethrowSceneFilter(err: unknown, sceneId: string, sceneOrder: number): never {
  if (err instanceof FluxContentFilteredError) {
    throw new FluxSceneFilteredError(err, sceneId, sceneOrder);
  }

  throw err;
}

async function generateFluxForPrompt(
  prompt: string,
  fluxStartAttempt: number,
  scene?: { id: string; order: number },
): Promise<Buffer> {
  try {
    return await generateImageWithRetry(prompt, {
      startAttempt: fluxStartAttempt,
      maxAttempts: FLUX_MAX_ATTEMPTS + fluxStartAttempt,
    });
  } catch (err) {
    if (scene) {
      rethrowSceneFilter(err, scene.id, scene.order);
    }

    throw err;
  }
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

export async function runFluxStage(
  projectId: string,
  options?: {
    skipExisting?: boolean;
    fluxStartAttempt?: number;
    scenePromptOverrides?: Record<string, string>;
    thumbnailPromptOverride?: string;
  },
): Promise<{
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
  const recovery = getRecoveryMeta(project.script);
  const fluxStartAttempt = options?.fluxStartAttempt ?? recovery.fluxStartAttempt ?? 0;
  const skipExisting = options?.skipExisting ?? true;

  if (!project.scenes.length) {
    throw new Error('No scenes found — run script stage first');
  }

  let thumbnailKey = project.thumbnail ?? '';

  if (!thumbnailKey || !skipExisting || options?.thumbnailPromptOverride) {
    const thumbPrompt = options?.thumbnailPromptOverride ?? script.thumbnailPrompt;
    const thumbnailBuffer = await generateFluxForPrompt(thumbPrompt, fluxStartAttempt);
    thumbnailKey = projectKey(projectId, 'thumbnail.jpg');

    await uploadObject({
      key: thumbnailKey,
      body: thumbnailBuffer,
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
  }

  const sceneKeys: string[] = [];

  for (const [index, scene] of project.scenes.entries()) {
    if (skipExisting && scene.imageUrl && !options?.scenePromptOverrides?.[scene.id]) {
      sceneKeys.push(...parseSceneImageKeys(scene));
      continue;
    }

    const scriptScene = script.scenes[index];
    const overridePrompt = options?.scenePromptOverrides?.[scene.id];
    const prompts = overridePrompt
      ? [
          `${overridePrompt}, wide establishing shot, cinematic framing`,
          `${overridePrompt}, dramatic medium shot, depth of field`,
          `${overridePrompt}, intense close-up, emotional detail`,
        ]
      : sceneImagePrompts(scene, scriptScene);
    const imageKeys: string[] = [];

    for (let variant = 0; variant < 3; variant += 1) {
      const prompt = prompts[variant] ?? prompts[0]!;
      const imageBuffer = await generateFluxForPrompt(prompt, fluxStartAttempt, {
        id: scene.id,
        order: scene.order,
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
