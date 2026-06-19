import { env } from '../../config/env.js';
import {
  chatterboxTts,
  checkChatterboxConnection,
  checkMagpieGrpcConnection,
  isChatterboxEnabled,
  listChatterboxVoices,
  listMagpieGrpcVoices,
  magpieGrpcTts,
} from './chatterbox-tts.service.js';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MAGPIE_FUNCTION_ID = '877104f7-e885-42b9-8de8-f6e4c6303969';

export type TtsProvider = 'magpie' | 'chatterbox' | 'openai';
export type TtsFallback = 'magpie-grpc' | 'chatterbox' | 'openai' | 'none';

function getProvider(): TtsProvider {
  const value = env.ttsProvider.toLowerCase();

  if (value === 'magpie' || value === 'chatterbox' || value === 'openai') {
    return value;
  }

  throw new Error(`Unsupported TTS_PROVIDER "${env.ttsProvider}". Use "magpie", "chatterbox", or "openai".`);
}

function getFallback(): TtsFallback {
  const value = env.ttsFallback.toLowerCase();

  if (value === 'magpie-grpc' || value === 'chatterbox' || value === 'openai' || value === 'none') {
    return value;
  }

  return 'magpie-grpc';
}

function getMagpieApiKey(): string {
  return env.magpieApiKey || env.nvidiaApiKey;
}

function getMagpieBaseUrl(): string {
  const functionId = env.magpieFunctionId || DEFAULT_MAGPIE_FUNCTION_ID;
  return `https://${functionId}.invocation.api.nvcf.nvidia.com`;
}

function normalizeInput(text: string): string {
  const input = text.trim().slice(0, 4000);

  if (input.length < 3) {
    throw new Error('Narration text is too short for TTS');
  }

  return input;
}

async function magpieTts(text: string): Promise<Buffer> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('MAGPIE_API_KEY or NVIDIA_API_KEY required for Magpie TTS');
  }

  const input = normalizeInput(text);
  const form = new FormData();
  form.append('language', env.ttsLanguage);
  form.append('text', input);
  form.append('voice', env.ttsVoice);

  const response = await fetch(`${getMagpieBaseUrl()}/v1/audio/synthesize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'audio/wav',
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Magpie TTS failed (${response.status}): ${errText.slice(0, 400)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function openaiTts(text: string): Promise<Buffer> {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured (required for OpenAI TTS)');
  }

  const input = normalizeInput(text).slice(0, 4096);

  const response = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input,
      voice: env.ttsVoice,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${errText.slice(0, 400)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeWithFallback(text: string, primary: TtsProvider): Promise<Buffer> {
  const fallback = getFallback();
  const attempts: Array<{ provider: string; run: () => Promise<Buffer> }> = [];

  if (primary === 'magpie') {
    attempts.push({ provider: 'magpie', run: () => magpieTts(text) });
  } else if (primary === 'chatterbox') {
    attempts.push({ provider: 'chatterbox', run: () => chatterboxTts(text) });
  } else {
    attempts.push({ provider: 'openai', run: () => openaiTts(text) });
  }

  if (fallback === 'magpie-grpc') {
    attempts.push({ provider: 'magpie-grpc', run: () => magpieGrpcTts(text) });
  }

  if (primary !== 'chatterbox' && fallback === 'chatterbox' && isChatterboxEnabled()) {
    attempts.push({ provider: 'chatterbox', run: () => chatterboxTts(text) });
  }

  if (primary !== 'openai' && fallback === 'openai') {
    attempts.push({ provider: 'openai', run: () => openaiTts(text) });
  }

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${attempt.provider}: ${message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

export async function listMagpieVoices(): Promise<unknown> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('MAGPIE_API_KEY or NVIDIA_API_KEY required');
  }

  const response = await fetch(`${getMagpieBaseUrl()}/v1/audio/list_voices`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Magpie list_voices failed (${response.status}): ${rawText.slice(0, 400)}`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

export { listChatterboxVoices, listMagpieGrpcVoices };

export async function generateNarrationAudio(text: string): Promise<Buffer> {
  const provider = getProvider();
  return synthesizeWithFallback(text, provider);
}

export async function checkTtsConnection(): Promise<{
  ok: boolean;
  message: string;
  provider: string;
  fallback?: string;
  chatterboxEnabled?: boolean;
}> {
  try {
    const provider = getProvider();
    const fallback = getFallback();

    if (provider === 'magpie') {
      if (!getMagpieApiKey()) {
        return { ok: false, message: 'MAGPIE_API_KEY or NVIDIA_API_KEY not set', provider, fallback };
      }

      await listMagpieVoices();
      return {
        ok: true,
        message: 'Magpie multilingual TTS connected',
        provider,
        fallback: fallback === 'none' ? undefined : fallback,
        chatterboxEnabled: isChatterboxEnabled(),
      };
    }

    if (provider === 'chatterbox') {
      const result = await checkChatterboxConnection();
      return { ok: result.ok, message: result.message, provider, fallback, chatterboxEnabled: isChatterboxEnabled() };
    }

    if (!env.openaiApiKey) {
      return { ok: false, message: 'OPENAI_API_KEY not set on server', provider, fallback };
    }

    return { ok: true, message: 'OpenAI TTS configured', provider, fallback };
  } catch (err) {
    const provider = getProvider();
    const fallback = getFallback();

    if (provider === 'magpie' && fallback === 'magpie-grpc') {
      const magpieGrpc = await checkMagpieGrpcConnection();
      if (magpieGrpc.ok) {
        return {
          ok: true,
          message: `Magpie HTTP unavailable; Magpie gRPC fallback ready (${magpieGrpc.message})`,
          provider,
          fallback,
          chatterboxEnabled: isChatterboxEnabled(),
        };
      }
    }

    const message = err instanceof Error ? err.message : 'TTS check failed';
    return { ok: false, message, provider: env.ttsProvider, fallback };
  }
}
