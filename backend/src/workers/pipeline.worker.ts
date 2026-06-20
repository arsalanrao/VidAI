import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queues/redis.js';
import { VIDEO_QUEUE_NAME, type RenderDispatchJobData, type VideoJobData } from '../queues/video.queue.js';
import { prisma } from '../db/client.js';
import { runScriptStage } from '../services/pipeline/script-stage.service.js';
import { runFluxStage } from '../services/pipeline/flux-stage.service.js';
import { runTtsStage } from '../services/pipeline/tts-stage.service.js';
import { checkPcHealth, executeProjectRender, pcRendererConfigured } from '../services/pc/pc-render.service.js';
import { videoQueue } from '../queues/video.queue.js';

async function processRenderDispatchJob(job: Job<RenderDispatchJobData>): Promise<void> {
  const { projectId } = job.data;

  const result = await executeProjectRender(projectId);

  if (!result.ok) {
    throw new Error(result.message);
  }

  console.log(`[worker] PC render finished for ${projectId}`);
}

async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { projectId } = job.data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'processing', errorMessage: null },
  });

  await job.updateProgress(5);

  const script = await runScriptStage(projectId);

  await job.updateProgress(30);

  const assets = await runFluxStage(projectId);

  await job.updateProgress(70);

  const narration = await runTtsStage(projectId);

  await job.updateProgress(90);

  if (pcRendererConfigured) {
    const health = await checkPcHealth();

    if (health.ok) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'rendering', errorMessage: null },
      });

      await videoQueue.add(
        'dispatch-render',
        { projectId },
        {
          jobId: `render-${projectId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      console.log(`[worker] queued PC render for ${projectId}`);
    } else {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'waiting_for_renderer',
          errorMessage: health.message,
        },
      });

      console.log(`[worker] PC offline for ${projectId}: ${health.message}`);
    }
  }

  await job.updateProgress(100);

  console.log(
    `[worker] narration ready for ${projectId}: "${script.title}" — ${assets.sceneKeys.length} scenes, audio ${narration.narrationKey}`,
  );
}

export function startPipelineWorker(): Worker<VideoJobData | RenderDispatchJobData> {
  const worker = new Worker<VideoJobData | RenderDispatchJobData>(
    VIDEO_QUEUE_NAME,
    async (job) => {
      try {
        if (job.name === 'dispatch-render') {
          await processRenderDispatchJob(job as Job<RenderDispatchJobData>);
          return;
        }

        await processVideoJob(job as Job<VideoJobData>);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown pipeline error';
        const projectId = job.data.projectId;

        if (job.name !== 'dispatch-render') {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'failed', errorMessage: message },
          });
        }

        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
      lockDuration: 60 * 60 * 1000,
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
