import { env } from '../../config/env.js';
import { rivaListVoices, rivaSynthesizeSpeech } from './riva-grpc.client.js';

const DEFAULT_CHATTERBOX_FUNCTION_ID = 'ddacc747-1269-4fab-bfd9-8f593dead106';

function getApiKey(): string {
  return env.chatterboxApiKey || env.nvidiaApiKey;
}

function getFunctionId(): string {
  return env.chatterboxFunctionId || DEFAULT_CHATTERBOX_FUNCTION_ID;
}

function getGrpcOptions() {
  return {
    server: env.chatterboxGrpcHost,
    functionId: getFunctionId(),
    apiKey: getApiKey(),
    sampleRateHz: env.ttsSampleRateHz,
  };
}

export async function chatterboxTts(text: string): Promise<Buffer> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('CHATTERBOX_API_KEY or NVIDIA_API_KEY required for Chatterbox TTS');
  }

  const input = text.trim().slice(0, 4000);

  if (input.length < 3) {
    throw new Error('Narration text is too short for TTS');
  }

  try {
    return await rivaSynthesizeSpeech({
      ...getGrpcOptions(),
      text: input,
      languageCode: env.ttsLanguage,
      voiceName: env.chatterboxVoice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Chatterbox TTS failed: ${message.slice(0, 400)}`);
  }
}

export async function listChatterboxVoices(): Promise<unknown> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('CHATTERBOX_API_KEY or NVIDIA_API_KEY required');
  }

  return rivaListVoices(getGrpcOptions());
}

export async function checkChatterboxConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    if (!getApiKey()) {
      return { ok: false, message: 'CHATTERBOX_API_KEY or NVIDIA_API_KEY not set' };
    }

    await listChatterboxVoices();
    return { ok: true, message: 'Chatterbox multilingual TTS connected (Riva gRPC)' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chatterbox check failed';
    return { ok: false, message };
  }
}
