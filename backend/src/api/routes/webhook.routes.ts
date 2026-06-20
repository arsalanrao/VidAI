import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { projectKey } from '../../services/storage/r2.service.js';
import { completeProjectRender, requestVideoUploadUrl } from '../../services/pc/render-webhook.service.js';

function verifyPcSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const secret = request.headers['x-api-secret'];

  if (!secret || secret !== env.pcApiSecret) {
    reply.status(401).send({ error: 'Invalid or missing X-Api-Secret header' });
    return false;
  }

  return true;
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { project_id?: string; ok?: boolean; video_key?: string; error?: string } }>(
    '/api/webhooks/render-complete',
    async (request, reply) => {
      if (!verifyPcSecret(request, reply)) {
        return;
      }

      const projectId = request.body?.project_id?.trim();
      const videoKey = request.body?.video_key?.trim();
      const error = request.body?.error?.trim();
      const ok = request.body?.ok !== false && !error;

      if (!projectId) {
        return reply.status(400).send({ error: 'project_id is required' });
      }

      if (!ok) {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: 'waiting_for_renderer',
            errorMessage: error ?? 'PC render failed',
          },
        });

        return reply.send({ ok: false, projectId, status: 'waiting_for_renderer' });
      }

      const result = await completeProjectRender(projectId, videoKey ?? projectKey(projectId, 'final.mp4'));

      if (!result.ok) {
        return reply.status(result.message.includes('not found') ? 404 : 500).send(result);
      }

      return reply.send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/project/:id/request-video-upload',
    async (request, reply) => {
      if (!verifyPcSecret(request, reply)) {
        return;
      }

      const result = await requestVideoUploadUrl(request.params.id);

      if (!result.ok) {
        return reply.status(result.message.includes('not found') ? 404 : 503).send(result);
      }

      return reply.send(result);
    },
  );
}
