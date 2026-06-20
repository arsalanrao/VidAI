import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env, r2Configured } from './config/env.js';
import { prisma } from './db/client.js';
import { registerProjectRoutes } from './api/routes/project.routes.js';
import { videoQueue } from './queues/video.queue.js';
import { startPipelineWorker } from './workers/pipeline.worker.js';
import { checkR2Connection } from './services/storage/r2.service.js';
import { isYtDlpAvailable, getYtDlpVersion, ensureYtDlpPath } from './services/youtube/ytdlp.service.js';
import { checkKimiConnection } from './services/ai/kimi.service.js';
import { checkFluxConnection } from './services/ai/flux.service.js';
import { checkTtsConnection, listChatterboxVoices, listMagpieGrpcVoices, listMagpieVoices } from './services/ai/tts.service.js';
import { checkPcHealth, pcRendererConfigured } from './services/pc/pc-render.service.js';
import { registerWebhookRoutes } from './api/routes/webhook.routes.js';
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

  app.get('/health/youtube', async () => {
    const ytdlpPath = await ensureYtDlpPath();
    const version = await getYtDlpVersion();

    return {
      ok: Boolean(version),
      ytdlp: await isYtDlpAvailable(),
      ytdlpPath,
      version,
    };
  });

  app.get('/health/kimi', async (_req, reply) => {
    const result = await checkKimiConnection();

    if (!result.ok) {
      return reply.status(503).send({ ok: false, kimi: result.message, provider: 'nvidia-build' });
    }

    return { ok: true, kimi: result.message, provider: 'nvidia-build', model: 'moonshotai/kimi-k2.6' };
  });

  app.get('/health/flux', async (_req, reply) => {
    const result = await checkFluxConnection();

    if (!result.ok) {
      return reply.status(503).send({ ok: false, flux: result.message, model: 'flux.2-klein-4b' });
    }

    return { ok: true, flux: result.message, model: 'flux.2-klein-4b' };
  });

  app.get('/health/tts', async (_req, reply) => {
    const result = await checkTtsConnection();

    if (!result.ok) {
      return reply.status(503).send({ ok: false, tts: result.message, provider: result.provider });
    }

    return {
      ok: true,
      tts: result.message,
      provider: result.provider,
      fallback: result.fallback,
      voice: env.ttsVoice,
      chatterboxVoice: env.chatterboxVoice,
    };
  });

  app.get('/health/tts/voices', async (req, reply) => {
    const provider = String((req.query as { provider?: string }).provider ?? env.ttsProvider).toLowerCase();

    try {
      if (provider === 'magpie-grpc') {
        const voices = await listMagpieGrpcVoices();
        return { ok: true, provider: 'magpie-grpc', voices };
      }

      if (provider === 'chatterbox') {
        const voices = await listChatterboxVoices();
        return { ok: true, provider: 'chatterbox', voices };
      }

      if (provider === 'magpie') {
        const voices = await listMagpieVoices();
        return { ok: true, provider: 'magpie', voices };
      }

      return reply.status(400).send({ error: 'Use ?provider=magpie, ?provider=magpie-grpc, or ?provider=chatterbox' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list voices';
      return reply.status(503).send({ ok: false, provider, error: message });
    }
  });

  app.get('/health/pc', async (_req, reply) => {
    const result = await checkPcHealth();

    if (!result.ok) {
      return reply.status(result.configured ? 503 : 503).send(result);
    }

    return result;
  });

  app.get('/health/moonshot', async (_req, reply) => {
    const result = await checkKimiConnection();

    if (!result.ok) {
      return reply.status(503).send({
        ok: false,
        deprecated: 'Use /health/kimi — Kimi now runs via NVIDIA Build',
        kimi: result.message,
      });
    }

    return {
      ok: true,
      deprecated: 'Use /health/kimi — Kimi now runs via NVIDIA Build',
      kimi: result.message,
    };
  });

  await registerProjectRoutes(app);
  await registerWebhookRoutes(app);

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
