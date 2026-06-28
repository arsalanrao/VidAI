import { prisma } from '../../db/client.js';
import { Prisma } from '@prisma/client';
import { videoQueue } from '../../queues/video.queue.js';
import { computeCompleteness } from '../project/completeness.service.js';
import type { ResumePipelineJobData } from '../../queues/video.queue.js';

export type PipelineFailedStage = 'start' | 'script' | 'images' | 'audio' | 'render';

export class PipelineStageError extends Error {
  stage: PipelineFailedStage;

  constructor(stage: PipelineFailedStage, message: string) {
    super(message);
    this.name = 'PipelineStageError';
    this.stage = stage;
  }
}

export type RecoveryMeta = {
  failedStage?: PipelineFailedStage;
  recoveryAttempt?: number;
  userDirection?: string;
  fluxStartAttempt?: number;
  extractMode?: 'default' | 'captions' | 'title_only';
  blockedPrompt?: string;
  suggestedPrompt?: string;
  promptAlternatives?: string[];
  failedSceneId?: string;
  failedSceneOrder?: number;
  aiPrompt?: string;
};

export function getRecoveryMeta(script: unknown): RecoveryMeta {
  if (!script || typeof script !== 'object') {
    return {};
  }

  const record = script as Record<string, unknown>;
  const meta: RecoveryMeta = {};

  if (typeof record.failedStage === 'string') {
    meta.failedStage = record.failedStage as PipelineFailedStage;
  }

  if (typeof record.recoveryAttempt === 'number') {
    meta.recoveryAttempt = record.recoveryAttempt;
  }

  if (typeof record.userDirection === 'string') {
    meta.userDirection = record.userDirection;
  }

  if (typeof record.fluxStartAttempt === 'number') {
    meta.fluxStartAttempt = record.fluxStartAttempt;
  }

  if (record.extractMode === 'captions' || record.extractMode === 'title_only' || record.extractMode === 'default') {
    meta.extractMode = record.extractMode;
  }

  if (typeof record.aiPrompt === 'string') {
    meta.aiPrompt = record.aiPrompt;
  }

  if (typeof record.blockedPrompt === 'string') {
    meta.blockedPrompt = record.blockedPrompt;
  }

  if (typeof record.suggestedPrompt === 'string') {
    meta.suggestedPrompt = record.suggestedPrompt;
  }

  if (Array.isArray(record.promptAlternatives)) {
    meta.promptAlternatives = record.promptAlternatives.filter(
      (item): item is string => typeof item === 'string',
    );
  }

  if (typeof record.failedSceneId === 'string') {
    meta.failedSceneId = record.failedSceneId;
  }

  if (typeof record.failedSceneOrder === 'number') {
    meta.failedSceneOrder = record.failedSceneOrder;
  }

  return meta;
}

export function inferFailedStageFromError(
  message: string,
  duringStage?: PipelineFailedStage,
): PipelineFailedStage {
  if (duringStage) {
    return duringStage;
  }

  const lower = message.toLowerCase();

  if (
    lower.includes('youtube') ||
    lower.includes('invalid youtube') ||
    lower.includes('could not fetch') ||
    lower.includes('ytdlp') ||
    lower.includes('queued timeout')
  ) {
    return 'start';
  }

  if (lower.includes('kimi') || lower.includes('invalid json') || lower.includes('script')) {
    return 'script';
  }

  if (
    lower.includes('flux') ||
    lower.includes('content_filtered') ||
    lower.includes('image') ||
    lower.includes('r2 not configured')
  ) {
    return 'images';
  }

  if (
    lower.includes('tts') ||
    lower.includes('magpie') ||
    lower.includes('chatterbox') ||
    lower.includes('narration') ||
    lower.includes('model is not available') ||
    (lower.includes('voice') && lower.includes('not found'))
  ) {
    return 'audio';
  }

  if (
    lower.includes('ffmpeg') ||
    lower.includes('render') ||
    lower.includes('memory') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return 'render';
  }

  return 'script';
}

export function inferFailedStage(project: {
  status: string;
  errorMessage: string | null;
  title: string | null;
  script: unknown;
  thumbnail: string | null;
  narrationUrl: string | null;
  videoUrl?: string | null;
  scenes: { imageUrl: string | null }[];
}): PipelineFailedStage | null {
  if (project.status === 'waiting_for_renderer') {
    return 'render';
  }

  if (project.status !== 'failed') {
    return null;
  }

  const meta = getRecoveryMeta(project.script);
  if (meta.failedStage) {
    return meta.failedStage;
  }

  if (project.errorMessage) {
    return inferFailedStageFromError(project.errorMessage);
  }

  const completeness = computeCompleteness({
    ...project,
    videoUrl: project.videoUrl ?? null,
  });

  if (!completeness.script) {
    return 'start';
  }

  if (!completeness.thumbnail || completeness.scenesDone < completeness.scenesTotal) {
    return completeness.narration ? 'images' : 'audio';
  }

  if (!completeness.narration) {
    return 'audio';
  }

  return 'render';
}

async function mergeScriptMeta(
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { script: true },
  });

  const existing =
    project?.script && typeof project.script === 'object'
      ? (project.script as Record<string, unknown>)
      : {};

  return { ...existing, ...patch };
}

export async function markPipelineFailure(
  projectId: string,
  stage: PipelineFailedStage,
  message: string,
  imageRecovery?: Omit<
    RecoveryMeta,
    'failedStage' | 'recoveryAttempt' | 'userDirection' | 'fluxStartAttempt' | 'extractMode'
  >,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { script: true },
  });
  const meta = getRecoveryMeta(project?.script);
  const merged = await mergeScriptMeta(projectId, {
    failedStage: stage,
    recoveryAttempt: (meta.recoveryAttempt ?? 0) + 1,
    ...(imageRecovery ?? {}),
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: stage === 'render' ? 'waiting_for_renderer' : 'failed',
      errorMessage: message,
      script: merged as Prisma.InputJsonValue,
    },
  });
}

export async function clearPipelineFailure(projectId: string): Promise<void> {
  const merged = await mergeScriptMeta(projectId, {
    failedStage: null,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { errorMessage: null, script: merged as Prisma.InputJsonValue },
  });
}

async function assertNotRunning(status: string): Promise<void> {
  if (['queued', 'processing', 'rendering'].includes(status)) {
    throw new Error(`Pipeline already running (status: ${status})`);
  }
}

export async function queueResumePipeline(
  projectId: string,
  data: ResumePipelineJobData,
): Promise<{ ok: true; message: string; status: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (project.status === 'done') {
    throw new Error('Project already complete');
  }

  await assertNotRunning(project.status);

  const merged = await mergeScriptMeta(projectId, {
    failedStage: null,
    ...(data.options?.userDirection ? { userDirection: data.options.userDirection } : {}),
    ...(data.options?.fluxStartAttempt !== undefined
      ? { fluxStartAttempt: data.options.fluxStartAttempt }
      : {}),
    ...(data.options?.extractMode ? { extractMode: data.options.extractMode } : {}),
  });

  if (data.options?.youtubeUrl?.trim()) {
    await prisma.project.update({
      where: { id: projectId },
      data: { youtubeUrl: data.options.youtubeUrl.trim() },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: data.fromStage === 'render' ? 'narration_ready' : 'processing',
      errorMessage: null,
      script: merged as Prisma.InputJsonValue,
    },
  });

  await videoQueue.add('resume-pipeline', data, {
    jobId: `resume-${projectId}-${Date.now()}`,
    removeOnComplete: true,
  });

  return {
    ok: true,
    message: recoveryMessage(data.fromStage),
    status: data.fromStage === 'render' ? 'rendering' : 'processing',
  };
}

function recoveryMessage(fromStage: PipelineFailedStage): string {
  switch (fromStage) {
    case 'start':
      return 'Restarting with alternate source extraction…';
    case 'script':
      return 'Regenerating script with your direction, then continuing pipeline…';
    case 'images':
      return 'Retrying images with safer prompts, then voice and render…';
    case 'audio':
      return 'Regenerating narration, then video render…';
    case 'render':
      return 'Fixing render with low-memory cloud settings…';
    default:
      return 'Recovery queued';
  }
}
