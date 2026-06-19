import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queues/redis.js';
import { VIDEO_QUEUE_NAME, type VideoJobData } from '../queues/video.queue.js';
import { prisma } from '../db/client.js';
import { runScriptStage } from '../services/pipeline/script-stage.service.js';

async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { projectId } = job.data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'processing', errorMessage: null },
  });

  await job.updateProgress(10);

  const script = await runScriptStage(projectId);

  await job.updateProgress(100);

  console.log(`[worker] script ready for ${projectId}: "${script.title}" (${script.scenes.length} scenes)`);
}

export function startPipelineWorker(): Worker<VideoJobData> {
  const worker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAME,
    async (job) => {
      try {
        await processVideoJob(job);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown pipeline error';

        await prisma.project.update({
          where: { id: job.data.projectId },
          data: { status: 'failed', errorMessage: message },
        });

        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  return worker;
}
