import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queues/redis.js';
import {
  VIDEO_QUEUE_NAME,
  type CloudRenderJobData,
  type RegenerateSceneJobData,
  type RegenerateThumbnailJobData,
  type VideoJobData,
} from '../queues/video.queue.js';
import { prisma } from '../db/client.js';
import { runScriptStage } from '../services/pipeline/script-stage.service.js';
import { runFluxStage } from '../services/pipeline/flux-stage.service.js';
import { runTtsStage } from '../services/pipeline/tts-stage.service.js';
import { runCloudRenderStage } from '../services/pipeline/cloud-render-stage.service.js';
import {
  regenerateScene,
  regenerateThumbnail,
} from '../services/pipeline/regenerate-stage.service.js';
import { videoQueue } from '../queues/video.queue.js';

async function processRegenerateThumbnailJob(job: Job<RegenerateThumbnailJobData>): Promise<void> {
  const { projectId } = job.data;
  await regenerateThumbnail(projectId);
  console.log(`[worker] thumbnail regenerated for ${projectId}`);
}

async function processRegenerateSceneJob(job: Job<RegenerateSceneJobData>): Promise<void> {
  const { projectId, sceneId } = job.data;
  await regenerateScene(projectId, sceneId);
  console.log(`[worker] scene ${sceneId} regenerated for ${projectId}`);
}

async function processCloudRenderJob(job: Job<CloudRenderJobData>): Promise<void> {
  const { projectId } = job.data;

  try {
    const result = await runCloudRenderStage(projectId);
    console.log(`[worker] cloud render finished for ${projectId}: ${result.videoKey}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cloud render failed';

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'waiting_for_renderer',
        errorMessage: message,
      },
    });

    throw err;
  }
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

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  await videoQueue.add(
    'cloud-render',
    { projectId },
    {
      jobId: `cloud-render-${projectId}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await job.updateProgress(100);

  console.log(
    `[worker] narration ready for ${projectId}: "${script.title}" — ${assets.sceneKeys.length} images, audio ${narration.narrationKey}`,
  );
}

export function startPipelineWorker(): Worker<
  VideoJobData | CloudRenderJobData | RegenerateThumbnailJobData | RegenerateSceneJobData
> {
  const worker = new Worker<
    VideoJobData | CloudRenderJobData | RegenerateThumbnailJobData | RegenerateSceneJobData
  >(
    VIDEO_QUEUE_NAME,
    async (job) => {
      try {
        if (job.name === 'cloud-render') {
          await processCloudRenderJob(job as Job<CloudRenderJobData>);
          return;
        }

        if (job.name === 'regenerate-thumbnail') {
          await processRegenerateThumbnailJob(job as Job<RegenerateThumbnailJobData>);
          return;
        }

        if (job.name === 'regenerate-scene') {
          await processRegenerateSceneJob(job as Job<RegenerateSceneJobData>);
          return;
        }

        await processVideoJob(job as Job<VideoJobData>);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown pipeline error';
        const projectId = job.data.projectId;

        if (job.name !== 'cloud-render' && job.name !== 'regenerate-thumbnail' && job.name !== 'regenerate-scene') {
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
