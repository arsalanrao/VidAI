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
  r2AccountId: optional('R2_ACCOUNT_ID'),
  r2AccessKeyId: optional('R2_ACCESS_KEY_ID'),
  r2SecretAccessKey: optional('R2_SECRET_ACCESS_KEY'),
  r2Bucket: optional('R2_BUCKET', 'vidaipro'),
  r2PublicUrl: optional('R2_PUBLIC_URL'),
  ytdlpPath: optional('YTDLP_PATH'),
  ttsProvider: optional('TTS_PROVIDER', 'magpie'),
  ttsVoice: optional('TTS_VOICE', 'Magpie-Multilingual.EN-US.Aria'),
  ttsLanguage: optional('TTS_LANGUAGE', 'en-US'),
  magpieFunctionId: optional('MAGPIE_FUNCTION_ID', '877104f7-e885-42b9-8de8-f6e4c6303969'),
} as const;

export const isProd = env.nodeEnv === 'production';

export const r2Configured =
  Boolean(env.r2AccountId) &&
  Boolean(env.r2AccessKeyId) &&
  Boolean(env.r2SecretAccessKey) &&
  Boolean(env.r2Bucket);
