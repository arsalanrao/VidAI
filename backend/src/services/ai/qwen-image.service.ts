import { env } from '../../config/env.js';
import { formatNvidiaError } from './flux.service.js';

// NVIDIA model card (self-hosted NIM): https://build.nvidia.com/qwen/qwen-image/modelcard
// Together AI partner (serverless): https://together.ai/models/qwen-image

const DEFAULT_TOGETHER_MODEL = 'Qwen/Qwen-Image';
const DEFAULT_NIM_OPENAI_MODEL = 'qwen/qwen-image-2512';

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

function resolveQwenModel(): string {
  if (env.qwenImageModel) {
    return env.qwenImageModel;
  }

  return env.qwenImageProvider === 'together' ? DEFAULT_TOGETHER_MODEL : DEFAULT_NIM_OPENAI_MODEL;
}

function resolveNimUrl(): string | null {
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

function resolveImageDimensions(): { width: number; height: number } {
  if (env.qwenImageSize) {
    const [widthRaw, heightRaw] = env.qwenImageSize.split('x');
    const width = Number(widthRaw);
    const height = Number(heightRaw);

    if (Number.isFinite(width) && Number.isFinite(height)) {
      return { width, height };
    }
  }

  switch (env.qwenImageAspectRatio) {
    case '16:9':
      return { width: 1344, height: 768 };
    case '1:1':
      return { width: 1024, height: 1024 };
    case '9:16':
    default:
      return { width: 768, height: 1344 };
  }
}

function ensureVerticalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('9:16') && lower.includes('no text')) {
    return trimmed;
  }

  return `${trimmed}, vertical 9:16 cinematic photorealistic, dramatic lighting, high detail, portrait composition, no text, no watermark`;
}

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

  if (env.qwenImageProvider === 'together') {
    return Boolean(env.togetherApiKey);
  }

  return Boolean(resolveNimUrl());
}

async function parseOpenAiImageResponse(data: OpenAiImageResponse): Promise<Buffer> {
  const b64 = data.data?.[0]?.b64_json;

  if (b64) {
    return Buffer.from(b64, 'base64');
  }

  const url = data.data?.[0]?.url;

  if (!url) {
    throw new Error(`Qwen image returned no image — ${formatNvidiaError(data, 200)}`);
  }

  const imageResponse = await fetch(url);

  if (!imageResponse.ok) {
    throw new Error(`Failed to download Qwen image from URL (${imageResponse.status})`);
  }

  return Buffer.from(await imageResponse.arrayBuffer());
}

function parseNimInferResponse(data: NimInferResponse): Buffer {
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

async function invokeTogether(payload: QwenPayload): Promise<Buffer> {
  if (!env.togetherApiKey) {
    throw new Error(
      'TOGETHER_API_KEY not configured — get one at https://api.together.ai/settings/api-keys',
    );
  }

  if (env.togetherApiKey.startsWith('nvapi-')) {
    throw new Error(
      'TOGETHER_API_KEY looks like an NVIDIA key (nvapi-…). Create a separate Together API key at https://api.together.ai/settings/api-keys',
    );
  }

  const { width, height } = resolveImageDimensions();

  // Official API: https://api.together.ai/models/Qwen/Qwen-Image
  // curl -X POST https://api.together.xyz/v1/images/generations \
  //   -H "Authorization: Bearer $TOGETHER_API_KEY" \
  //   -d '{"model":"Qwen/Qwen-Image","prompt":"..."}'
  const body: Record<string, unknown> = {
    model: resolveQwenModel(),
    prompt: payload.prompt,
    width,
    height,
    n: 1,
    response_format: 'b64_json',
  };

  if (payload.seed > 0) {
    body.seed = payload.seed;
  }

  const response = await fetch(env.togetherImageUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.togetherApiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
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
    const err = new Error(`Together Qwen image failed (${response.status}): ${detail}`);
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }

  let data: OpenAiImageResponse;

  try {
    data = JSON.parse(rawText) as OpenAiImageResponse;
  } catch {
    throw new Error('Together Qwen image returned invalid JSON response');
  }

  return await parseOpenAiImageResponse(data);
}

function buildNimRequestBody(url: string, payload: QwenPayload): Record<string, unknown> {
  if (isNimInferUrl(url)) {
    return {
      prompt: payload.prompt,
      seed: payload.seed,
    };
  }

  if (isOpenAiImageUrl(url)) {
    const body: Record<string, unknown> = {
      model: resolveQwenModel(),
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

async function invokeNim(payload: QwenPayload): Promise<Buffer> {
  const url = resolveNimUrl();

  if (!url) {
    throw new Error(
      'Qwen NIM not configured — set QWEN_IMAGE_BASE_URL or QWEN_IMAGE_URL. See https://build.nvidia.com/qwen/qwen-image/modelcard',
    );
  }

  const apiKey = env.nvidiaApiKeyQwen;
  const needsAuth = !isLocalNimUrl(url);

  if (needsAuth && !apiKey) {
    throw new Error('NVIDIA_API_KEY_QWEN required for remote Qwen NIM endpoint');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (needsAuth && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildNimRequestBody(url, payload)),
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
    const err = new Error(`Qwen NIM invocation failed (${response.status}): ${detail}`);
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }

  let data: NimInferResponse & OpenAiImageResponse;

  try {
    data = JSON.parse(rawText) as NimInferResponse & OpenAiImageResponse;
  } catch {
    throw new Error('Qwen NIM returned invalid JSON response');
  }

  if (isOpenAiImageUrl(url)) {
    return await parseOpenAiImageResponse(data);
  }

  return parseNimInferResponse(data);
}

export async function generateQwenImage(prompt: string, seed?: number): Promise<Buffer> {
  const payload = {
    prompt: ensureVerticalPrompt(prompt),
    seed: resolveSeed(seed),
  };

  if (env.qwenImageProvider === 'together') {
    return invokeTogether(payload);
  }

  return invokeNim(payload);
}

export async function checkQwenImageConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.qwenImageEnabled) {
    return { ok: false, message: 'Qwen image fallback disabled (QWEN_IMAGE_ENABLED=false)' };
  }

  if (!isQwenImageConfigured()) {
    return {
      ok: false,
      message:
        env.qwenImageProvider === 'together'
          ? 'Together partner not configured — set TOGETHER_API_KEY from https://together.ai/models/qwen-image'
          : 'Qwen NIM not configured — set QWEN_IMAGE_BASE_URL or QWEN_IMAGE_URL',
    };
  }

  try {
    await generateQwenImage('a simple blue circle on white background, no text, family-friendly', 0);
    return {
      ok: true,
      message:
        env.qwenImageProvider === 'together'
          ? `Together Qwen partner working (${resolveQwenModel()})`
          : `Qwen NIM working (${resolveNimUrl()})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

export function getQwenImageEndpoint(): string | null {
  if (env.qwenImageProvider === 'together') {
    return env.togetherImageUrl;
  }

  return resolveNimUrl();
}

export function getQwenImageProvider(): string {
  return env.qwenImageProvider;
}
