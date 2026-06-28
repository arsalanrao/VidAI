import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

export const VIDEO_QUEUE_NAME = 'video-pipeline';

export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export type VideoJobData = {
  projectId: string;
};

export type CloudRenderJobData = {
  projectId: string;
};

export type RegenerateThumbnailJobData = {
  projectId: string;
};

export type RegenerateSceneJobData = {
  projectId: string;
  sceneId: string;
  promptOverride?: string;
  fluxStartAttempt?: number;
};

export type ResumePipelineJobData = {
  projectId: string;
  fromStage: 'start' | 'script' | 'images' | 'audio' | 'render';
  options?: {
    youtubeUrl?: string;
    userDirection?: string;
    sceneId?: string;
    promptOverride?: string;
    thumbnailPromptOverride?: string;
    voicePreset?: string;
    voiceEmotion?: string;
    recoveryAttempt?: number;
    fluxStartAttempt?: number;
    extractMode?: 'default' | 'captions' | 'title_only';
    fixRenderLowMemory?: boolean;
  };
};
