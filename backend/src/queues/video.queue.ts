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

export type RenderDispatchJobData = {
  projectId: string;
};
