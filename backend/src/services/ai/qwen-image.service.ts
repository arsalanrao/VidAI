import { env } from '../../config/env.js';
import { formatNvidiaError } from './flux.service.js';

// Model card: https://build.nvidia.com/qwen/qwen-image/modelcard
// NIM docs: https://docs.nvidia.com/nim/visual-genai/latest/getting-started.html
// Qwen-Image uses POST /v1/infer with { prompt, seed } → artifacts[0].base64
// Same NIM also exposes POST /v1/images/generations (OpenAI-compatible).

type QwenArtifact = {
  base64?: string;
  finishReason?: string;
  seed?: number;
};

type NimInferResponse = {
  artifacts?: QwenArtifact[];
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  title?: unknown;
};

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: unknown;
  detail?: unknown;
  message?: unknown;
};

type QwenPayload = {
  prompt: string;
  seed: number;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveQwenUrl(): string | null {
  if (env.qwenImageUrl) {
    return env.qwenImageUrl;
  }

  if (!env.qwenImageBaseUrl) {
    return null;
  }

  const base = trimTrailingSlash(env.qwenImageBaseUrl);

  if (env.qwenImageApi === 'openai') {
    return `${base}/v1/images/generations`;
  }

  return `${base}/v1/infer`;
}

function isNimInferUrl(url: string): boolean {
  return url.includes('/v1/infer');
}

function isOpenAiImageUrl(url: string): boolean {
  return url.includes('/images/generations');
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

/** Model card: seed 0 produces a new image on each call. */
function resolveSeed(explicit?: number): number {
  if (explicit !== undefined) {
    return explicit;
  }

  if (env.qwenImageSeed === 'random') {
    return Math.floor(Math.random() * 2_147_483_646) + 1;
  }

  const parsed = Number(env.qwenImageSeed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isQwenImageConfigured(): boolean {
  if (!env.qwenImageEnabled) {
    return false;
  }

  return Boolean(resolveQwenUrl());
}

function resolveQwenApiKey(): string {
  return env.nvidiaApiKeyQwen;
}

function requiresAuth(url: string): boolean {
  if (isLocalNimUrl(url)) {
    return false;
  }

  return Boolean(resolveQwenApiKey());
}

function buildRequestBody(url: string, payload: QwenPayload): Record<string, unknown> {
  if (isNimInferUrl(url)) {
    return {
      prompt: payload.prompt,
      seed: payload.seed,
    };
  }

  if (isOpenAiImageUrl(url)) {
    const body: Record<string, unknown> = {
      model: env.qwenImageModel,
      prompt: payload.prompt,
      n: 1,
      response_format: 'b64_json',
    };

    if (env.qwenImageSize) {
      body.size = env.qwenImageSize;
    }

    return body;
  }

  return {
    prompt: payload.prompt,
    seed: payload.seed,
  };
}

function parseImageBuffer(url: string, data: NimInferResponse & OpenAiImageResponse): Buffer {
  if (isOpenAiImageUrl(url)) {
    const b64 = data.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error(`Qwen image returned no image — ${formatNvidiaError(data, 200)}`);
    }

    return Buffer.from(b64, 'base64');
  }

  const artifact = data.artifacts?.[0];
  const finishReason = artifact?.finishReason ?? 'UNKNOWN';

  if (!artifact?.base64) {
    throw new Error(
      finishReason === 'CONTENT_FILTERED'
        ? 'Qwen image content filtered (CONTENT_FILTERED)'
        : `Qwen image returned no image — ${formatNvidiaError(data, 200)}`,
    );
  }

  if (finishReason !== 'SUCCESS' && finishReason !== 'STOP' && finishReason !== 'UNKNOWN') {
    throw new Error(`Qwen image generation failed: ${finishReason}`);
  }

  return Buffer.from(artifact.base64, 'base64');
}

async function invokeQwen(payload: QwenPayload): Promise<Buffer> {
  const url = resolveQwenUrl();

  if (!url) {
    throw new Error(
      'Qwen NIM endpoint not configured — set QWEN_IMAGE_BASE_URL (e.g. http://localhost:8000) or QWEN_IMAGE_URL (e.g. http://localhost:8000/v1/infer). See https://build.nvidia.com/qwen/qwen-image/modelcard',
    );
  }

  const apiKey = resolveQwenApiKey();

  if (requiresAuth(url) && !apiKey) {
    throw new Error('NVIDIA_API_KEY_QWEN required for remote Qwen NIM endpoint');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey && requiresAuth(url)) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(url, payload)),
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

  let data: NimInferResponse & OpenAiImageResponse;

  try {
    data = JSON.parse(rawText) as NimInferResponse & OpenAiImageResponse;
  } catch {
    throw new Error('Qwen image returned invalid JSON response');
  }

  return parseImageBuffer(url, data);
}

export async function generateQwenImage(prompt: string, seed?: number): Promise<Buffer> {
  return invokeQwen({
    prompt: ensureVerticalPrompt(prompt),
    seed: resolveSeed(seed),
  });
}

export async function checkQwenImageConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.qwenImageEnabled) {
    return { ok: false, message: 'Qwen image fallback disabled (QWEN_IMAGE_ENABLED=false)' };
  }

  const url = resolveQwenUrl();

  if (!url) {
    return {
      ok: false,
      message:
        'Qwen NIM not configured — set QWEN_IMAGE_BASE_URL=http://HOST:8000 or QWEN_IMAGE_URL=http://HOST:8000/v1/infer',
    };
  }

  try {
    await generateQwenImage('a simple blue circle on white background, no text, family-friendly', 0);
    return { ok: true, message: `Qwen NIM working (${url})` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

export function getQwenImageEndpoint(): string | null {
  return resolveQwenUrl();
}
