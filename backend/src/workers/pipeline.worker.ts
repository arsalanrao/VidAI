import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queues/redis.js';
import { VIDEO_QUEUE_NAME, type VideoJobData } from '../queues/video.queue.js';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';

async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { projectId } = job.data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'processing' },
  });

  // Step 6–12: transcript → Kimi → FLUX → TTS → PC dispatch
  // Placeholder so queue + DB wiring can be tested before AI services land.
  await job.updateProgress(10);

  if (!env.moonshotApiKey) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'failed',
        errorMessage: 'MOONSHOT_API_KEY not configured',
      },
    });
    throw new Error('MOONSHOT_API_KEY not configured');
  }

  await job.updateProgress(100);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'queued',
      errorMessage: null,
    },
  });
}

export function startPipelineWorker(): Worker<VideoJobData> {
  const worker = new Worker<VideoJobData>(VIDEO_QUEUE_NAME, processVideoJob, {
    connection: redisConnection,
    concurrency: 1,
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  return worker;
}
