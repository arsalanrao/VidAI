import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { resolveAssetUrl } from '../../services/pipeline/flux-stage.service.js';
import { pcRendererConfigured, validateProjectForRender } from '../../services/pc/pc-render.service.js';

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { youtubeUrl?: string } }>('/api/project/create', async (request, reply) => {
    const youtubeUrl = request.body?.youtubeUrl?.trim();

    if (!youtubeUrl) {
      return reply.status(400).send({ error: 'youtubeUrl is required' });
    }

    const project = await prisma.project.create({
      data: {
        youtubeUrl,
        status: 'queued',
      },
    });

    await videoQueue.add('process', { projectId: project.id });

    return reply.status(201).send({
      projectId: project.id,
      status: project.status,
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
    if (!pcRendererConfigured) {
      return reply.status(503).send({
        error: 'PC renderer not configured',
        hint: 'Set PC_SERVER_URL and PC_API_SECRET on Render',
      });
    }

    const projectId = request.params.id;
    const validation = await validateProjectForRender(projectId);

    if (!validation.ok) {
      return reply.status(validation.message.includes('not found') ? 404 : 503).send(validation);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });

    if (project?.status === 'rendering' && request.query?.force !== '1') {
      return reply.status(202).send({
        ok: true,
        status: 'rendering',
        message: 'Render already in progress — poll GET /api/project/:id/status (add ?force=1 to re-queue)',
      });
    }

    if (project?.status === 'done') {
      return reply.status(409).send({
        ok: false,
        message: 'Project already complete',
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'rendering', errorMessage: null },
    });

    try {
      await videoQueue.add(
        'dispatch-render',
        { projectId },
        {
          jobId: `render-${projectId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to queue render job';
      if (!message.toLowerCase().includes('job') || !message.toLowerCase().includes('exist')) {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'waiting_for_renderer', errorMessage: message },
        });
        return reply.status(503).send({ ok: false, message });
      }
    }

    return reply.status(202).send({
      ok: true,
      status: 'rendering',
      message: 'Render job queued on your PC — poll GET /api/project/:id/status (may take several minutes per scene)',
    });
  }

  app.route({
    method: ['GET', 'POST'],
    url: '/api/project/:id/dispatch-render',
    handler: dispatchRenderHandler,
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
        ...scene,
        imageUrl: await resolveAssetUrl(scene.imageUrl),
      })),
    );

    return reply.send({
      id: project.id,
      status: project.status,
      title: project.title,
      thumbnail,
      videoUrl,
      narrationUrl,
      script: project.script,
      scenes,
      errorMessage: project.errorMessage,
    });
  });
}
