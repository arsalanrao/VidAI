import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { resolveAssetUrl } from '../../services/pipeline/flux-stage.service.js';
import { dispatchProjectRender, pcRendererConfigured } from '../../services/pc/pc-render.service.js';

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

  app.post<{ Params: { id: string } }>('/api/project/:id/dispatch-render', async (request, reply) => {
    if (!pcRendererConfigured) {
      return reply.status(503).send({
        error: 'PC renderer not configured',
        hint: 'Set PC_SERVER_URL and PC_API_SECRET on Render',
      });
    }

    const result = await dispatchProjectRender(request.params.id);

    if (!result.ok) {
      return reply.status(result.message.includes('not found') ? 404 : 503).send(result);
    }

    return reply.send(result);
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
      videoUrl: project.videoUrl,
      narrationUrl,
      script: project.script,
      scenes,
      errorMessage: project.errorMessage,
    });
  });
}
