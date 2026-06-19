import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

export const redisConnection: ConnectionOptions = {
  url: env.redisUrl,
  maxRetriesPerRequest: null,
  ...(env.redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
};
