import { env } from '../../config/env.js';
import type { TtsVoiceConfig } from '../../types/project-preferences.types.js';
import {
  chatterboxHttpTts,
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

export type TtsProvider = 'chatterbox' | 'magpie' | 'openai';

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

async function magpieTts(text: string, voice: string): Promise<Buffer> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('MAGPIE_API_KEY or NVIDIA_API_KEY required for Magpie TTS');
  }

  const input = normalizeInput(text);
  const form = new FormData();
  form.append('language', env.ttsLanguage);
  form.append('text', input);
  form.append('voice', voice);

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

async function openaiTts(text: string, voice?: string): Promise<Buffer> {
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
      voice: voice ?? env.ttsVoice,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${errText.slice(0, 400)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function resolveVoices(voiceConfig?: TtsVoiceConfig): TtsVoiceConfig {
  return {
    chatterboxVoice: voiceConfig?.chatterboxVoice ?? env.chatterboxVoice,
    magpieVoice: voiceConfig?.magpieVoice ?? env.ttsVoice,
    openaiVoice: voiceConfig?.openaiVoice,
  };
}

/**
 * Chatterbox (best quality) → Magpie HTTP → Magpie gRPC → optional OpenAI.
 * Each provider uses its own voice name from the preset mapping.
 */
async function synthesizeWithFallback(text: string, voiceConfig?: TtsVoiceConfig): Promise<Buffer> {
  const voices = resolveVoices(voiceConfig);
  const attempts: Array<{ provider: string; run: () => Promise<Buffer> }> = [];

  if (isChatterboxEnabled()) {
    attempts.push({
      provider: 'chatterbox',
      run: () => chatterboxTts(text, voices.chatterboxVoice),
    });
    attempts.push({
      provider: 'chatterbox-http',
      run: () => chatterboxHttpTts(text, voices.chatterboxVoice),
    });
  }

  if (getMagpieApiKey()) {
    attempts.push({
      provider: 'magpie',
      run: () => magpieTts(text, voices.magpieVoice),
    });
    attempts.push({
      provider: 'magpie-grpc',
      run: () => magpieGrpcTts(text, voices.magpieVoice),
    });
  }

  if (env.openaiApiKey && env.ttsFallback === 'openai') {
    attempts.push({
      provider: 'openai',
      run: () => openaiTts(text, voices.openaiVoice),
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      'No TTS provider configured. Set OPENAI_API_KEY (Chatterbox) and/or MAGPIE_API_KEY / NVIDIA_API_KEY (Magpie).',
    );
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

export async function generateNarrationAudio(
  text: string,
  voiceConfig?: TtsVoiceConfig,
): Promise<Buffer> {
  return synthesizeWithFallback(text, voiceConfig);
}

export async function checkTtsConnection(): Promise<{
  ok: boolean;
  message: string;
  provider: string;
  fallback?: string;
  chatterboxEnabled?: boolean;
}> {
  const chatterboxEnabled = isChatterboxEnabled();
  const magpieKey = getMagpieApiKey();
  const provider = env.ttsProvider;

  if (!chatterboxEnabled && !magpieKey) {
    return {
      ok: false,
      message: 'No TTS keys configured. Set OPENAI_API_KEY (Chatterbox) and/or NVIDIA_API_KEY (Magpie).',
      provider,
    };
  }

  const errors: string[] = [];

  if (chatterboxEnabled) {
    const chatterbox = await checkChatterboxConnection();
    if (chatterbox.ok) {
      return {
        ok: true,
        message: 'Chatterbox multilingual TTS connected (primary)',
        provider: 'chatterbox',
        fallback: magpieKey ? 'magpie' : undefined,
        chatterboxEnabled: true,
      };
    }
    errors.push(chatterbox.message);
  }

  if (magpieKey) {
    try {
      await listMagpieVoices();
      return {
        ok: true,
        message: chatterboxEnabled
          ? `Chatterbox unavailable (${errors[0] ?? 'check failed'}); Magpie HTTP ready as fallback`
          : 'Magpie multilingual TTS connected',
        provider: chatterboxEnabled ? 'chatterbox' : 'magpie',
        fallback: 'magpie-grpc',
        chatterboxEnabled,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`magpie: ${message}`);
    }

    const magpieGrpc = await checkMagpieGrpcConnection();
    if (magpieGrpc.ok) {
      return {
        ok: true,
        message: `Magpie HTTP unavailable; Magpie gRPC ready (${magpieGrpc.message})`,
        provider: 'magpie-grpc',
        chatterboxEnabled,
      };
    }
    errors.push(magpieGrpc.message);
  }

  return {
    ok: false,
    message: errors.join(' | ') || 'TTS check failed',
    provider,
    chatterboxEnabled,
  };
}
