import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env, r2Configured } from './config/env.js';
import { prisma } from './db/client.js';
import { registerProjectRoutes } from './api/routes/project.routes.js';
import { videoQueue } from './queues/video.queue.js';
import { startPipelineWorker } from './workers/pipeline.worker.js';
import { checkR2Connection } from './services/storage/r2.service.js';
import type { Worker } from 'bullmq';

let worker: Worker | undefined;

async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({
    ok: true,
    service: 'vidaipro-api',
    env: env.nodeEnv,
  }));

  app.get('/health/db', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, database: 'connected' };
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ ok: false, database: 'disconnected' });
    }
  });

  app.get('/health/redis', async (_req, reply) => {
    try {
      const jobCounts = await videoQueue.getJobCounts();
      return { ok: true, redis: 'connected', queue: jobCounts };
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ ok: false, redis: 'disconnected' });
    }
  });

  app.get('/health/r2', async (_req, reply) => {
    if (!r2Configured) {
      return reply.status(503).send({ ok: false, r2: 'not_configured' });
    }

    try {
      await checkR2Connection();
      return {
        ok: true,
        r2: 'connected',
        bucket: env.r2Bucket,
        publicUrl: env.r2PublicUrl || null,
      };
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ ok: false, r2: 'disconnected' });
    }
  });

  await registerProjectRoutes(app);

  return app;
}

async function main() {
  const app = await buildApp();

  if (env.runWorker) {
    worker = startPipelineWorker();
    app.log.info('Pipeline worker started in-process (Path B / Render free tier)');
  }

  const shutdown = async () => {
    app.log.info('Shutting down…');
    await worker?.close();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
