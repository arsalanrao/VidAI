import { env } from '../../config/env.js';
import type { TtsVoiceConfig } from '../../types/project-preferences.types.js';
import {
  MAGPIE_CHARACTERS,
  magpieEmotionForApi,
  magpieVoiceFallbackChain,
  normalizeMagpieVoice,
} from './magpie-voices.js';
import {
  preferencesToTtsVoice,
  type VoicePreset,
} from '../../types/project-preferences.types.js';
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

export type TtsSynthesisOptions = {
  voiceConfig?: TtsVoiceConfig;
  /** Increments on each audio recovery — rotates Magpie fallback voices. */
  recoveryAttempt?: number;
};

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

async function magpieTts(text: string, voice: string, emotion?: string): Promise<Buffer> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('MAGPIE_API_KEY or NVIDIA_API_KEY required for Magpie TTS');
  }

  const input = normalizeInput(text);
  const normalizedVoice = normalizeMagpieVoice(voice);
  const form = new FormData();
  form.append('language', env.ttsLanguage);
  form.append('text', input);
  form.append('voice', normalizedVoice);
  if (emotion) {
    form.append('emotion', emotion);
  }

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
  if (voiceConfig) {
    return {
      ...voiceConfig,
      magpieVoice: normalizeMagpieVoice(voiceConfig.magpieVoice),
    };
  }

  return preferencesToTtsVoice({ voicePreset: 'mia', voiceEmotion: 'default' });
}

function voiceConfigForRecoveryAttempt(
  base: TtsVoiceConfig,
  recoveryAttempt: number,
): TtsVoiceConfig {
  if (recoveryAttempt <= 0) {
    return base;
  }

  const character = MAGPIE_CHARACTERS[recoveryAttempt % MAGPIE_CHARACTERS.length] as VoicePreset;
  return preferencesToTtsVoice({ voicePreset: character, voiceEmotion: base.magpieEmotion });
}

async function tryMagpieProviders(
  text: string,
  voice: string,
  emotion?: string,
): Promise<Buffer> {
  const errors: string[] = [];

  try {
    return await magpieTts(text, voice, emotion);
  } catch (err) {
    errors.push(`magpie: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return await magpieGrpcTts(text, voice);
  } catch (err) {
    errors.push(`magpie-grpc: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error(errors.join(' | '));
}

/**
 * Chatterbox → Magpie (with voice fallback chain) → optional OpenAI.
 * Magpie requires full Riva voice ids (e.g. Magpie-Multilingual.EN-US.Mia).
 */
async function synthesizeWithFallback(
  text: string,
  options?: TtsSynthesisOptions,
): Promise<Buffer> {
  const recoveryAttempt = options?.recoveryAttempt ?? 0;
  const voices = voiceConfigForRecoveryAttempt(
    resolveVoices(options?.voiceConfig),
    recoveryAttempt,
  );
  const errors: string[] = [];

  if (isChatterboxEnabled()) {
    for (const provider of ['chatterbox', 'chatterbox-http'] as const) {
      try {
        if (provider === 'chatterbox') {
          return await chatterboxTts(text, voices.chatterboxVoice);
        }
        return await chatterboxHttpTts(text, voices.chatterboxVoice);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${provider}: ${message}`);
      }
    }
  }

  if (getMagpieApiKey()) {
    const voiceChain = magpieVoiceFallbackChain(voices.magpieVoice, recoveryAttempt);
    const emotion = magpieEmotionForApi(voices.magpieEmotion);

    for (const magpieVoice of voiceChain) {
      try {
        return await tryMagpieProviders(text, magpieVoice, emotion);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
      }
    }
  }

  if (env.openaiApiKey && env.ttsFallback === 'openai') {
    try {
      return await openaiTts(text, voices.openaiVoice);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`openai: ${message}`);
    }
  }

  if (errors.length === 0) {
    throw new Error(
      'No TTS provider configured. Set OPENAI_API_KEY (Chatterbox) and/or MAGPIE_API_KEY / NVIDIA_API_KEY (Magpie).',
    );
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
  options?: TtsSynthesisOptions,
): Promise<Buffer> {
  return synthesizeWithFallback(text, options);
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
