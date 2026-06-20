import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { resolveAssetUrl } from '../../services/pipeline/flux-stage.service.js';
import { queueCloudRender } from '../../services/video/cloud-render-dispatch.service.js';
import { computeCompleteness } from '../../services/project/completeness.service.js';
import { deleteProject } from '../../services/project/delete-project.service.js';
import { projectPreferencesSchema } from '../../types/project-preferences.types.js';

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
        preferences,
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
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(project);
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

  app.post<{ Params: { id: string; sceneId: string } }>(
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
        { projectId: request.params.id, sceneId: scene.id },
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
