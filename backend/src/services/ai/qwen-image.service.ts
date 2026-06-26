import { env } from '../../config/env.js';
import { formatNvidiaError } from './flux.service.js';

// NVIDIA Build — https://build.nvidia.com/qwen/qwen-image
const DEFAULT_QWEN_CLOUD_URL = 'https://ai.api.nvidia.com/v1/genai/qwen/qwen-image';

type QwenArtifact = {
  base64?: string;
  finishReason?: string;
  seed?: number;
};

type QwenResponse = {
  artifacts?: QwenArtifact[];
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  title?: unknown;
};

type QwenPayload = {
  prompt: string;
  seed: number;
};

function resolveQwenUrl(): string {
  return env.qwenImageUrl || DEFAULT_QWEN_CLOUD_URL;
}

function isNimInferUrl(url: string): boolean {
  return url.includes('/v1/infer');
}

function isLocalNimUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

function ensureVerticalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('9:16') && lower.includes('no text')) {
    return trimmed;
  }

  return `${trimmed}, vertical 9:16 cinematic photorealistic, dramatic lighting, high detail, portrait composition, no text, no watermark`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_646) + 1;
}

export function isQwenImageConfigured(): boolean {
  if (!env.qwenImageEnabled) {
    return false;
  }

  const url = resolveQwenUrl();

  if (isLocalNimUrl(url)) {
    return true;
  }

  return Boolean(env.nvidiaApiKeyQwen);
}

function resolveQwenApiKey(): string {
  return env.nvidiaApiKeyQwen;
}

async function invokeQwen(payload: QwenPayload): Promise<Buffer> {
  const url = resolveQwenUrl();
  const apiKey = resolveQwenApiKey();

  if (!isLocalNimUrl(url) && !apiKey) {
    throw new Error('NVIDIA_API_KEY_QWEN (or NVIDIA_API_KEY) not configured for Qwen cloud image API');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey && !isLocalNimUrl(url)) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body = isNimInferUrl(url)
    ? { prompt: payload.prompt, seed: payload.seed }
    : {
        prompt: payload.prompt,
        seed: payload.seed,
        aspect_ratio: env.qwenImageAspectRatio,
      };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const rawText = await response.text();

  if (response.status !== 200) {
    let errData: unknown = rawText;

    try {
      errData = JSON.parse(rawText);
    } catch {
      // keep raw text
    }

    const detail = formatNvidiaError(errData, response.status);
    const err = new Error(`Qwen image invocation failed (${response.status}): ${detail}`);
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }

  let data: QwenResponse;

  try {
    data = JSON.parse(rawText) as QwenResponse;
  } catch {
    throw new Error('Qwen image returned invalid JSON response');
  }

  const artifact = data.artifacts?.[0];
  const finishReason = artifact?.finishReason ?? 'UNKNOWN';

  if (!artifact?.base64) {
    throw new Error(
      finishReason === 'CONTENT_FILTERED'
        ? 'Qwen image content filtered (CONTENT_FILTERED)'
        : `Qwen image returned no image — ${formatNvidiaError(data, response.status)}`,
    );
  }

  if (finishReason !== 'SUCCESS' && finishReason !== 'STOP') {
    throw new Error(`Qwen image generation failed: ${finishReason}`);
  }

  return Buffer.from(artifact.base64, 'base64');
}

export async function generateQwenImage(prompt: string, seed = randomSeed()): Promise<Buffer> {
  return invokeQwen({
    prompt: ensureVerticalPrompt(prompt),
    seed,
  });
}

export async function checkQwenImageConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isQwenImageConfigured()) {
    return { ok: false, message: 'Qwen image fallback disabled or NVIDIA_API_KEY_QWEN not set' };
  }

  try {
    await generateQwenImage('a simple blue circle on white background, no text, family-friendly', 42);
    return { ok: true, message: 'Qwen image API working' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
