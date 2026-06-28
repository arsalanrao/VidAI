import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queues/redis.js';
import {
  VIDEO_QUEUE_NAME,
  type CloudRenderJobData,
  type RegenerateSceneJobData,
  type RegenerateThumbnailJobData,
  type ResumePipelineJobData,
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
import {
  inferFailedStageFromError,
  markPipelineFailure,
  PipelineStageError,
  type PipelineFailedStage,
} from '../services/pipeline/pipeline-recovery.service.js';
import {
  FluxContentFilteredError,
  FluxSceneFilteredError,
} from '../services/ai/flux.service.js';
import { queueCloudRender } from '../services/video/cloud-render-dispatch.service.js';
import { videoQueue } from '../queues/video.queue.js';
import type { VoicePreset } from '../types/project-preferences.types.js';

type WorkerJobData =
  | VideoJobData
  | CloudRenderJobData
  | RegenerateThumbnailJobData
  | RegenerateSceneJobData
  | ResumePipelineJobData;

async function runStage<T>(
  projectId: string,
  stage: PipelineFailedStage,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const failedStage = err instanceof PipelineStageError ? err.stage : stage;
    const message = err instanceof Error ? err.message : `${stage} stage failed`;

    if (err instanceof FluxSceneFilteredError) {
      await markPipelineFailure(projectId, 'images', message, {
        blockedPrompt: err.originalPrompt,
        suggestedPrompt: err.suggestedPrompt,
        promptAlternatives: err.alternatives,
        failedSceneId: err.sceneId,
        failedSceneOrder: err.sceneOrder,
      });
      throw err;
    }

    if (err instanceof FluxContentFilteredError) {
      await markPipelineFailure(projectId, 'images', message, {
        blockedPrompt: err.originalPrompt,
        suggestedPrompt: err.suggestedPrompt,
        promptAlternatives: err.alternatives,
      });
      throw err;
    }

    await markPipelineFailure(projectId, failedStage, message);
    throw err;
  }
}

async function continueAfterScript(projectId: string, job: Job<WorkerJobData>): Promise<void> {
  await job.updateProgress(30);
  await runStage(projectId, 'images', () => runFluxStage(projectId, { skipExisting: true }));
  await job.updateProgress(70);
  await runStage(projectId, 'audio', () => runTtsStage(projectId));
  await job.updateProgress(90);
  await finishRender(projectId);
  await job.updateProgress(100);
}

async function finishRender(projectId: string): Promise<void> {
  try {
    await runCloudRenderStage(projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cloud render failed';
    await markPipelineFailure(projectId, 'render', message);
    console.error(`[worker] cloud render failed for ${projectId}:`, message);
  }
}

async function processRegenerateThumbnailJob(job: Job<RegenerateThumbnailJobData>): Promise<void> {
  const { projectId } = job.data;

  try {
    await regenerateThumbnail(projectId);
    console.log(`[worker] thumbnail regenerated for ${projectId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Thumbnail regeneration failed';
    await markPipelineFailure(projectId, 'images', message);
    throw err;
  }
}

async function processRegenerateSceneJob(job: Job<RegenerateSceneJobData>): Promise<void> {
  const { projectId, sceneId, promptOverride, fluxStartAttempt } = job.data;

  try {
    await regenerateScene(projectId, sceneId, { promptOverride, fluxStartAttempt });
    console.log(`[worker] scene ${sceneId} regenerated for ${projectId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scene regeneration failed';
    await markPipelineFailure(projectId, 'images', message);
    throw err;
  }
}

async function processCloudRenderJob(job: Job<CloudRenderJobData>): Promise<void> {
  const { projectId } = job.data;

  try {
    const result = await runCloudRenderStage(projectId);
    console.log(`[worker] cloud render finished for ${projectId}: ${result.videoKey}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cloud render failed';
    await markPipelineFailure(projectId, 'render', message);
    throw err;
  }
}

async function processResumePipelineJob(job: Job<ResumePipelineJobData>): Promise<void> {
  const { projectId, fromStage, options } = job.data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'processing', errorMessage: null },
  });

  if (fromStage === 'start' || fromStage === 'script') {
    const extractModes: Array<'default' | 'captions' | 'title_only'> = [
      'default',
      'captions',
      'title_only',
    ];
    const recoveryIndex = options?.extractMode
      ? extractModes.indexOf(options.extractMode)
      : Math.min((options?.fluxStartAttempt ?? 0) + 1, extractModes.length - 1);

    await runStage(projectId, 'start', () =>
      runScriptStage(projectId, {
        userDirection: options?.userDirection,
        extractMode: options?.extractMode ?? extractModes[Math.max(0, recoveryIndex)] ?? 'default',
      }),
    );
    await continueAfterScript(projectId, job);
    return;
  }

  if (fromStage === 'images') {
    const sceneOverrides =
      options?.sceneId && options.promptOverride
        ? { [options.sceneId]: options.promptOverride }
        : undefined;

    await runStage(projectId, 'images', () =>
      runFluxStage(projectId, {
        skipExisting: true,
        fluxStartAttempt: (options?.fluxStartAttempt ?? 0) + 2,
        scenePromptOverrides: sceneOverrides,
        thumbnailPromptOverride: options?.thumbnailPromptOverride,
      }),
    );
    await job.updateProgress(70);
    await runStage(projectId, 'audio', () => runTtsStage(projectId));
    await job.updateProgress(90);
    await finishRender(projectId);
    await job.updateProgress(100);
    return;
  }

  if (fromStage === 'audio') {
    await runStage(projectId, 'audio', () =>
      runTtsStage(projectId, {
        voicePreset: options?.voicePreset as VoicePreset | undefined,
        recoveryAttempt: options?.recoveryAttempt ?? 0,
      }),
    );
    await job.updateProgress(90);
    await finishRender(projectId);
    await job.updateProgress(100);
    return;
  }

  if (fromStage === 'render') {
    const result = await queueCloudRender(projectId, { force: true });
    if (!result.ok) {
      await markPipelineFailure(projectId, 'render', result.message);
      throw new Error(result.message);
    }
  }
}

async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { projectId } = job.data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'processing', errorMessage: null },
  });

  await job.updateProgress(5);

  await runStage(projectId, 'start', () => runScriptStage(projectId));
  await job.updateProgress(30);
  await runStage(projectId, 'images', () => runFluxStage(projectId, { skipExisting: false }));
  await job.updateProgress(70);
  await runStage(projectId, 'audio', () => runTtsStage(projectId));
  await job.updateProgress(90);
  await finishRender(projectId);
  await job.updateProgress(100);

  console.log(`[worker] pipeline complete for ${projectId}`);
}

export function startPipelineWorker(): Worker<WorkerJobData> {
  const worker = new Worker<WorkerJobData>(
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

        if (job.name === 'resume-pipeline') {
          await processResumePipelineJob(job as Job<ResumePipelineJobData>);
          return;
        }

        await processVideoJob(job as Job<VideoJobData>);
      } catch (err) {
        if (err instanceof PipelineStageError) {
          throw err;
        }

        const message = err instanceof Error ? err.message : 'Unknown pipeline error';
        const projectId = job.data.projectId;

        if (job.name === 'process') {
          await markPipelineFailure(
            projectId,
            inferFailedStageFromError(message),
            message,
          );
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
