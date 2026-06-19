import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() ?? fallback;
}

function normalizeRedisUrl(raw: string): string {
  const value = raw.trim();

  if (!value) {
    throw new Error('Missing required env var: REDIS_URL');
  }

  if (value.includes('--tls') || value.includes('redis-cli')) {
    throw new Error(
      'REDIS_URL looks like a redis-cli command. In Upstash, copy the "Rediss" URL (starts with rediss://), not the CLI example.',
    );
  }

  if (value.startsWith('redis://')) {
    return value.replace(/^redis:\/\//, 'rediss://');
  }

  return value;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3000')),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: normalizeRedisUrl(required('REDIS_URL')),
  jwtSecret: optional('JWT_SECRET', 'dev-only-change-me'),
  nvidiaApiKey: optional('NVIDIA_API_KEY'),
  moonshotApiKey: optional('MOONSHOT_API_KEY'),
  openaiApiKey: optional('OPENAI_API_KEY'),
  magpieApiKey: optional('MAGPIE_API_KEY'),
  pcServerUrl: optional('PC_SERVER_URL'),
  pcApiSecret: optional('PC_API_SECRET'),
  runWorker: optional('RUN_WORKER', 'true') === 'true',
} as const;

export const isProd = env.nodeEnv === 'production';
