import { env } from '../../config/env.js';
import { rivaListVoices, rivaSynthesizeSpeech } from './riva-grpc.client.js';

// Chatterbox: https://build.nvidia.com/resembleai/chatterbox-multilingual-tts/api
// Auth: OPENAI_API_KEY only — see docs/TTS_MODELS.md

const DEFAULT_MAGPIE_FUNCTION_ID = '877104f7-e885-42b9-8de8-f6e4c6303969';
const DEFAULT_CHATTERBOX_FUNCTION_ID = 'ddacc747-1269-4fab-bfd9-8f593dead106';

function getMagpieApiKey(): string {
  return env.magpieApiKey || env.nvidiaApiKey;
}

function getChatterboxApiKey(): string {
  return env.chatterboxApiKey || env.openaiApiKey;
}

function formatRivaError(label: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('NOT_FOUND') || message.includes('Not found')) {
    return new Error(
      `${label}: function not found for your account. Open Chatterbox on build.nvidia.com, click Try API, and copy the function-id into CHATTERBOX_FUNCTION_ID.`,
    );
  }

  return new Error(`${label} failed: ${message.slice(0, 400)}`);
}

function getMagpieFunctionId(): string {
  return env.magpieFunctionId || DEFAULT_MAGPIE_FUNCTION_ID;
}

function getChatterboxFunctionId(): string {
  return env.chatterboxFunctionId || DEFAULT_CHATTERBOX_FUNCTION_ID;
}

export function isChatterboxEnabled(): boolean {
  return Boolean(getChatterboxApiKey());
}

function getMagpieGrpcOptions() {
  return {
    server: env.chatterboxGrpcHost,
    functionId: getMagpieFunctionId(),
    apiKey: getMagpieApiKey(),
    sampleRateHz: env.ttsSampleRateHz,
  };
}

function getChatterboxGrpcOptions() {
  return {
    server: env.chatterboxGrpcHost,
    functionId: getChatterboxFunctionId(),
    apiKey: getChatterboxApiKey(),
    sampleRateHz: env.ttsSampleRateHz,
  };
}

export async function magpieGrpcTts(text: string, voiceName?: string): Promise<Buffer> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY required for Magpie gRPC TTS');
  }

  const input = text.trim().slice(0, 4000);

  if (input.length < 3) {
    throw new Error('Narration text is too short for TTS');
  }

  try {
    return await rivaSynthesizeSpeech({
      ...getMagpieGrpcOptions(),
      text: input,
      languageCode: env.ttsLanguage,
      voiceName: voiceName ?? env.ttsVoice,
    });
  } catch (err) {
    throw formatRivaError('Magpie gRPC TTS', err);
  }
}

export async function listMagpieGrpcVoices(): Promise<unknown> {
  const apiKey = getMagpieApiKey();

  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY required');
  }

  try {
    return await rivaListVoices(getMagpieGrpcOptions());
  } catch (err) {
    throw formatRivaError('Magpie gRPC list_voices', err);
  }
}

export async function chatterboxTts(text: string, voiceName?: string): Promise<Buffer> {
  const apiKey = getChatterboxApiKey();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for Chatterbox TTS');
  }

  const input = text.trim().slice(0, 4000);

  if (input.length < 3) {
    throw new Error('Narration text is too short for TTS');
  }

  try {
    return await rivaSynthesizeSpeech({
      ...getChatterboxGrpcOptions(),
      text: input,
      languageCode: env.ttsLanguage,
      voiceName: voiceName ?? env.chatterboxVoice,
    });
  } catch (err) {
    throw formatRivaError('Chatterbox TTS', err);
  }
}

export async function listChatterboxVoices(): Promise<unknown> {
  const apiKey = getChatterboxApiKey();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for Chatterbox');
  }

  try {
    return await rivaListVoices(getChatterboxGrpcOptions());
  } catch (err) {
    throw formatRivaError('Chatterbox list_voices', err);
  }
}

export async function checkMagpieGrpcConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    if (!getMagpieApiKey()) {
      return { ok: false, message: 'NVIDIA_API_KEY not set' };
    }

    await listMagpieGrpcVoices();
    return { ok: true, message: 'Magpie gRPC fallback connected' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Magpie gRPC check failed';
    return { ok: false, message };
  }
}

export async function checkChatterboxConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    if (!getChatterboxApiKey()) {
      return { ok: false, message: 'OPENAI_API_KEY not set (required for Chatterbox gRPC auth)' };
    }

    await listChatterboxVoices();
    return { ok: true, message: 'Chatterbox multilingual TTS connected (Riva gRPC, OPENAI_API_KEY)' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chatterbox check failed';
    return { ok: false, message };
  }
}
