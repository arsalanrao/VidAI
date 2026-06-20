import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { resolveAssetUrl } from '../../services/pipeline/flux-stage.service.js';
import { queueCloudRender } from '../../services/video/cloud-render-dispatch.service.js';
import { computeCompleteness } from '../../services/project/completeness.service.js';
import { deleteProject } from '../../services/project/delete-project.service.js';
import {
  getRecoveryMeta,
  inferFailedStage,
  queueResumePipeline,
} from '../../services/pipeline/pipeline-recovery.service.js';
import {
  buildSaferPromptSuggestions,
  buildSaferPromptSuggestionsWithAi,
} from '../../services/pipeline/image-prompt.service.js';
import { projectPreferencesSchema } from '../../types/project-preferences.types.js';
import { Prisma } from '@prisma/client';

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      youtubeUrl?: string;
      preferences?: Record<string, unknown>;
    };
  }>('/api/project/create', async (request, reply) => {
    const youtubeUrl = request.body?.youtubeUrl?.trim();

    if (!youtubeUrl) {
      return reply.status(400).send({ error: 'youtubeUrl is required' });
    }

    const preferences = projectPreferencesSchema.parse(request.body?.preferences ?? {});

    const project = await prisma.project.create({
      data: {
        youtubeUrl,
        status: 'queued',
        script: { preferences },
      },
    });

    await videoQueue.add('process', { projectId: project.id });

    return reply.status(201).send({
      projectId: project.id,
      status: project.status,
    });
  });

  app.get<{ Querystring: { limit?: string } }>('/api/projects', async (request, reply) => {
    const limit = Math.min(Number(request.query?.limit ?? 50) || 50, 100);

    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        errorMessage: true,
        updatedAt: true,
        youtubeUrl: true,
        thumbnail: true,
        videoUrl: true,
        script: true,
        narrationUrl: true,
        scenes: { select: { imageUrl: true } },
      },
    });

    return reply.send({
      projects: await Promise.all(
        projects.map(async (project) => ({
          id: project.id,
          title: project.title,
          status: project.status,
          errorMessage: project.errorMessage,
          updatedAt: project.updatedAt,
          youtubeUrl: project.youtubeUrl,
          thumbnail: await resolveAssetUrl(project.thumbnail),
          videoUrl: await resolveAssetUrl(project.videoUrl),
          completeness: computeCompleteness(project),
        })),
      ),
    });
  });

  app.get<{ Params: { id: string } }>('/api/project/:id/status', async (request, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        status: true,
        title: true,
        errorMessage: true,
        updatedAt: true,
        youtubeUrl: true,
        script: true,
        thumbnail: true,
        narrationUrl: true,
        videoUrl: true,
        scenes: { select: { id: true, order: true, prompt: true, imageUrl: true } },
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const completeness = computeCompleteness(project);
    const failedStage = inferFailedStage(project);
    const recovery = getRecoveryMeta(project.script);
    const imageRecovery =
      recovery.blockedPrompt || recovery.suggestedPrompt
        ? {
            blockedPrompt: recovery.blockedPrompt ?? null,
            suggestedPrompt: recovery.suggestedPrompt ?? null,
            promptAlternatives: recovery.promptAlternatives ?? [],
            failedSceneId: recovery.failedSceneId ?? null,
            failedSceneOrder: recovery.failedSceneOrder ?? null,
            aiPrompt: recovery.aiPrompt ?? null,
          }
        : null;

    return reply.send({
      id: project.id,
      status: project.status,
      title: project.title,
      errorMessage: project.errorMessage,
      updatedAt: project.updatedAt,
      youtubeUrl: project.youtubeUrl,
      failedStage,
      recoveryAttempt: recovery.recoveryAttempt ?? 0,
      completeness,
      imageRecovery,
      scenes: project.scenes.map((scene) => ({
        id: scene.id,
        order: scene.order,
        prompt: scene.prompt,
        hasImage: Boolean(scene.imageUrl),
      })),
    });
  });

  async function recoveryHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    fromStage: 'start' | 'script' | 'images' | 'audio' | 'render',
    extra?: Record<string, unknown>,
  ) {
    try {
      const body = (request.body ?? {}) as {
        youtubeUrl?: string;
        userDirection?: string;
        sceneId?: string;
        promptOverride?: string;
        thumbnailPromptOverride?: string;
        voicePreset?: string;
      };
      const meta = getRecoveryMeta(
        (
          await prisma.project.findUnique({
            where: { id: request.params.id },
            select: { script: true },
          })
        )?.script,
      );

      const result = await queueResumePipeline(request.params.id, {
        projectId: request.params.id,
        fromStage,
        options: {
          youtubeUrl: body.youtubeUrl,
          userDirection: body.userDirection,
          sceneId: body.sceneId,
          promptOverride: body.promptOverride,
          thumbnailPromptOverride: body.thumbnailPromptOverride,
          voicePreset: body.voicePreset,
          fluxStartAttempt:
            fromStage === 'images'
              ? (meta.fluxStartAttempt ?? 0) + 2
              : meta.fluxStartAttempt ?? meta.recoveryAttempt ?? 0,
          ...extra,
        },
      });

      return reply.status(202).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Recovery failed';
      const code = message.includes('not found') ? 404 : message.includes('already') ? 409 : 503;
      return reply.status(code).send({ ok: false, message });
    }
  }

  app.post<{ Params: { id: string }; Body: { youtubeUrl?: string } }>(
    '/api/project/:id/retry-start',
    async (request, reply) => {
      const meta = getRecoveryMeta(
        (
          await prisma.project.findUnique({
            where: { id: request.params.id },
            select: { script: true },
          })
        )?.script,
      );
      const modes = ['default', 'captions', 'title_only'] as const;
      const nextMode = modes[Math.min((meta.recoveryAttempt ?? 0) + 1, modes.length - 1)];

      return recoveryHandler(request, reply, 'start', { extractMode: nextMode });
    },
  );

  app.post<{ Params: { id: string }; Body: { userDirection?: string; youtubeUrl?: string } }>(
    '/api/project/:id/retry-script',
    async (request, reply) => recoveryHandler(request, reply, 'script'),
  );

  app.post<{
    Params: { id: string };
    Body: { sceneId?: string; promptOverride?: string; thumbnailPromptOverride?: string };
  }>('/api/project/:id/retry-images', async (request, reply) =>
    recoveryHandler(request, reply, 'images'),
  );

  app.post<{ Params: { id: string }; Body: { voicePreset?: string } }>(
    '/api/project/:id/retry-audio',
    async (request, reply) => recoveryHandler(request, reply, 'audio'),
  );

  app.post<{ Params: { id: string } }>(
    '/api/project/:id/fix-render',
    async (request, reply) =>
      recoveryHandler(request, reply, 'render', { fixRenderLowMemory: true }),
  );

  app.post<{
    Params: { id: string };
    Body: { prompt?: string; sceneId?: string; useAi?: boolean };
  }>('/api/project/:id/suggest-safer-prompt', async (request, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: request.params.id },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const recovery = getRecoveryMeta(project.script);
    const scene = request.body?.sceneId
      ? project.scenes.find((item) => item.id === request.body.sceneId)
      : project.scenes.find((item) => item.id === recovery.failedSceneId) ?? project.scenes[0];

    const blockedPrompt =
      request.body?.prompt?.trim() ||
      recovery.blockedPrompt ||
      scene?.prompt ||
      (typeof project.script === 'object' &&
      project.script &&
      'thumbnailPrompt' in project.script &&
      typeof (project.script as Record<string, unknown>).thumbnailPrompt === 'string'
        ? String((project.script as Record<string, unknown>).thumbnailPrompt)
        : '');

    if (!blockedPrompt) {
      return reply.status(400).send({ error: 'No prompt available to soften' });
    }

    const useAi = request.body?.useAi !== false;
    const result = useAi
      ? await buildSaferPromptSuggestionsWithAi(blockedPrompt)
      : buildSaferPromptSuggestions(blockedPrompt);

    const existingScript =
      project.script && typeof project.script === 'object'
        ? (project.script as Record<string, unknown>)
        : {};

    await prisma.project.update({
      where: { id: project.id },
      data: {
        script: {
          ...existingScript,
          blockedPrompt: result.blockedPrompt,
          suggestedPrompt: result.suggestedPrompt,
          promptAlternatives: result.alternatives,
          aiPrompt: result.aiPrompt ?? null,
          failedSceneId: scene?.id ?? recovery.failedSceneId ?? null,
          failedSceneOrder: scene?.order ?? recovery.failedSceneOrder ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return reply.send({
      ok: true,
      blockedPrompt: result.blockedPrompt,
      suggestedPrompt: result.suggestedPrompt,
      alternatives: result.alternatives,
      aiPrompt: result.aiPrompt ?? null,
    });
  });

  async function dispatchRenderHandler(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { force?: string } }>,
    reply: FastifyReply,
  ) {
    const result = await queueCloudRender(request.params.id, {
      force: request.query?.force === '1',
    });

    if (!result.ok) {
      const code = result.message.includes('not found')
        ? 404
        : result.status === 'processing' || result.status === 'queued'
          ? 409
          : 503;
      return reply.status(code).send(result);
    }

    return reply.status(202).send(result);
  }

  app.route({
    method: ['GET', 'POST'],
    url: '/api/project/:id/dispatch-render',
    handler: dispatchRenderHandler,
  });

  app.post<{ Params: { id: string } }>(
    '/api/project/:id/resume-render',
    async (request, reply) => {
      const result = await queueCloudRender(request.params.id, { force: true });

      if (!result.ok) {
        return reply.status(409).send(result);
      }

      return reply.status(202).send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/project/:id/retry-pipeline',
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.id },
        select: { status: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.status === 'done') {
        return reply.status(409).send({ error: 'Project already complete' });
      }

      if (['rendering', 'queued', 'processing'].includes(project.status)) {
        return reply.status(409).send({
          error: 'Pipeline already running',
          status: project.status,
        });
      }

      await prisma.project.update({
        where: { id: request.params.id },
        data: { status: 'queued', errorMessage: null },
      });

      await videoQueue.add(
        'process',
        { projectId: request.params.id },
        { jobId: `process-${request.params.id}`, removeOnComplete: true },
      );

      return reply.status(202).send({
        ok: true,
        message: 'Pipeline retry queued',
        status: 'queued',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/project/:id/regenerate-thumbnail',
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.id },
        select: { id: true, script: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!project.script) {
        return reply.status(409).send({ error: 'Script not ready yet' });
      }

      await videoQueue.add(
        'regenerate-thumbnail',
        { projectId: project.id },
        { jobId: `thumb-${project.id}-${Date.now()}`, removeOnComplete: true },
      );

      return reply.status(202).send({
        ok: true,
        message: 'Thumbnail regeneration queued',
      });
    },
  );

  app.post<{
    Params: { id: string; sceneId: string };
    Body: { promptOverride?: string };
  }>(
    '/api/project/:id/scenes/:sceneId/regenerate',
    async (request, reply) => {
      const scene = await prisma.scene.findFirst({
        where: { id: request.params.sceneId, projectId: request.params.id },
      });

      if (!scene) {
        return reply.status(404).send({ error: 'Scene not found' });
      }

      await videoQueue.add(
        'regenerate-scene',
        {
          projectId: request.params.id,
          sceneId: scene.id,
          promptOverride: request.body?.promptOverride,
        },
        { jobId: `scene-${scene.id}-${Date.now()}`, removeOnComplete: true },
      );

      return reply.status(202).send({
        ok: true,
        message: 'Scene regeneration queued (3 FLUX variants)',
      });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/project/:id', async (request, reply) => {
    try {
      const result = await deleteProject(request.params.id);
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';

      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }

      return reply.status(500).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>('/api/project/:id/result', async (request, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: request.params.id },
      include: {
        scenes: { orderBy: { order: 'asc' } },
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const thumbnail = await resolveAssetUrl(project.thumbnail);
    const narrationUrl = await resolveAssetUrl(project.narrationUrl);
    const videoUrl = await resolveAssetUrl(project.videoUrl);
    const scenes = await Promise.all(
      project.scenes.map(async (scene) => ({
        id: scene.id,
        order: scene.order,
        prompt: scene.prompt,
        duration: scene.duration,
        imageUrl: await resolveAssetUrl(scene.imageUrl),
        complete: Boolean(scene.imageUrl),
      })),
    );

    const script = project.script as Record<string, unknown> | null;

    return reply.send({
      id: project.id,
      status: project.status,
      title: project.title,
      description: typeof script?.description === 'string' ? script.description : null,
      hook: typeof script?.hook === 'string' ? script.hook : null,
      tags: Array.isArray(script?.tags) ? script.tags : [],
      thumbnail,
      videoUrl,
      narrationUrl,
      script: project.script,
      scenes,
      errorMessage: project.errorMessage,
      completeness: computeCompleteness(project),
    });
  });
}
