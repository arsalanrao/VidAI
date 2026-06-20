import { env } from '../../config/env.js';

// NVIDIA Build — https://build.nvidia.com/black-forest-labs/flux_2-klein-4b
const FLUX_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';

// NVIDIA NIM only accepts width/height from a fixed enum (768–1344).
// 768×1344 is portrait 9:16 — valid for Shorts. FFmpeg upscales during render.
export const FLUX_WIDTH = 768;
export const FLUX_HEIGHT = 1344;
export const FLUX_STEPS = 4;
export const FLUX_MAX_ATTEMPTS = 5;

type FluxArtifact = {
  base64?: string;
  finishReason?: string;
  seed?: number;
};

type FluxResponse = {
  artifacts?: FluxArtifact[];
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  title?: unknown;
};

type FluxPayload = {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
};

const FLUX_FALLBACK_SIZES: Array<{ width: number; height: number }> = [
  { width: FLUX_WIDTH, height: FLUX_HEIGHT },
  { width: 832, height: 1216 },
  { width: 1024, height: 1024 },
];

export class FluxContentFilteredError extends Error {
  finishReason: string;
  seed: number;

  constructor(finishReason: string, seed: number) {
    super(`FLUX content filtered (${finishReason})`);
    this.name = 'FluxContentFilteredError';
    this.finishReason = finishReason;
    this.seed = seed;
  }
}

const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/marvel/gi, ''],
  [/avengers?/gi, 'generic hero team'],
  [/iron man/gi, 'hero in red and gold powered armor'],
  [/captain america/gi, 'hero with shield'],
  [/thor/gi, 'mythic warrior with hammer'],
  [/hulk/gi, 'large green strong figure'],
  [/spider-?man/gi, 'hero in red and blue suit'],
  [/batman/gi, 'dark caped hero'],
  [/superman/gi, 'flying caped hero'],
  [/disney/gi, ''],
  [/pixar/gi, ''],
  [/star wars/gi, 'sci-fi space adventure'],
  [/harry potter/gi, 'young wizard fantasy'],
];

const VIOLENT_TERMS =
  /\b(blood|gore|kill|killed|murder|weapon|weapons|gun|guns|rifle|fight|fighting|violent|violence|defeat|punch|punching|attack|attacking|war|battle|explosion|explode|dead|death|dying|injury|wound|stab|shoot|shot)\b/gi;

const SAFETY_SUFFIX =
  'family-friendly, safe for work, no violence, no weapons, no blood, stylized cinematic digital art, no text';

function ensureVerticalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('9:16') && lower.includes('no text')) {
    return trimmed;
  }

  return `${trimmed}, vertical 9:16 cinematic photorealistic, dramatic lighting, film grain, high detail, portrait composition, no text, no watermark`;
}

/** Progressively soften prompts when NVIDIA CONTENT_FILTERED triggers. */
export function softenPromptForFilter(prompt: string, attempt: number): string {
  let result = prompt.trim();

  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  if (attempt >= 1) {
    result = result.replace(VIOLENT_TERMS, 'dramatic moment');
  }

  if (attempt >= 2) {
    result = `${result}, ${SAFETY_SUFFIX}`;
  }

  if (attempt >= 3) {
    const mood = result.split(/[,.]/)[0]?.trim().slice(0, 80) ?? 'cinematic scene';
    result = `Vertical 9:16 cinematic b-roll illustration, ${mood}, soft dramatic lighting, abstract storytelling, ${SAFETY_SUFFIX}`;
  }

  if (attempt >= 4) {
    result = `Vertical 9:16 abstract cinematic background, gradient lighting, minimal shapes, calm mood, ${SAFETY_SUFFIX}`;
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function formatNvidiaError(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return `HTTP ${status}`;
  }

  const record = data as Record<string, unknown>;

  for (const key of ['detail', 'message', 'error', 'title']) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg);
          }

          return JSON.stringify(item);
        })
        .join('; ');
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }
  }

  return JSON.stringify(record).slice(0, 500);
}

async function invokeFlux(payload: FluxPayload): Promise<Buffer> {
  if (!env.nvidiaApiKey) {
    throw new Error('NVIDIA_API_KEY not configured (required for FLUX images)');
  }

  const response = await fetch(FLUX_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.nvidiaApiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
    const err = new Error(`FLUX invocation failed (${response.status}): ${detail}`);
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }

  let data: FluxResponse;

  try {
    data = JSON.parse(rawText) as FluxResponse;
  } catch {
    throw new Error('FLUX returned invalid JSON response');
  }

  const artifact = data.artifacts?.[0];
  const finishReason = artifact?.finishReason ?? 'UNKNOWN';

  if (!artifact?.base64) {
    if (finishReason === 'CONTENT_FILTERED') {
      throw new FluxContentFilteredError(finishReason, artifact?.seed ?? payload.seed);
    }

    throw new Error(`FLUX returned no image — ${formatNvidiaError(data, response.status)}`);
  }

  if (finishReason !== 'SUCCESS' && finishReason !== 'STOP') {
    if (finishReason === 'CONTENT_FILTERED') {
      throw new FluxContentFilteredError(finishReason, artifact.seed ?? payload.seed);
    }

    throw new Error(`FLUX generation failed: ${finishReason}`);
  }

  return Buffer.from(artifact.base64, 'base64');
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_646) + 1;
}

function isRetryableFluxError(err: unknown): boolean {
  if (err instanceof FluxContentFilteredError) {
    return true;
  }

  if (err instanceof Error) {
    if (err.message.includes('CONTENT_FILTERED')) {
      return true;
    }

    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 422) {
      return true;
    }
  }

  return false;
}

function isDimensionError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  const statusCode = (err as Error & { statusCode?: number }).statusCode;
  return statusCode === 422 || err.message.includes('422');
}

export async function generateFluxImage(prompt: string, seed = randomSeed()): Promise<Buffer> {
  return generateFluxImageWithRetry(prompt, { maxAttempts: 1, seed });
}

export async function generateFluxImageWithRetry(
  prompt: string,
  options?: { maxAttempts?: number; seed?: number },
): Promise<Buffer> {
  const maxAttempts = options?.maxAttempts ?? FLUX_MAX_ATTEMPTS;
  let lastError: Error | undefined;
  let sizeIndex = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const softened = softenPromptForFilter(prompt, attempt);
    const seed = attempt === 0 && options?.seed !== undefined ? options.seed : randomSeed();
    const size = FLUX_FALLBACK_SIZES[Math.min(sizeIndex, FLUX_FALLBACK_SIZES.length - 1)]!;

    try {
      return await invokeFlux({
        prompt: ensureVerticalPrompt(softened),
        width: size.width,
        height: size.height,
        seed,
        steps: FLUX_STEPS,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (isDimensionError(err) && sizeIndex < FLUX_FALLBACK_SIZES.length - 1) {
        sizeIndex += 1;
        console.warn(
          `[flux] dimension rejected (${size.width}x${size.height}), retrying ${FLUX_FALLBACK_SIZES[sizeIndex]!.width}x${FLUX_FALLBACK_SIZES[sizeIndex]!.height}`,
        );
        continue;
      }

      if (!isRetryableFluxError(err) || attempt >= maxAttempts - 1) {
        throw lastError;
      }

      console.warn(
        `[flux] CONTENT_FILTERED on attempt ${attempt + 1}/${maxAttempts}, retrying with softer prompt`,
      );
    }
  }

  throw lastError ?? new Error('FLUX generation failed after retries');
}

export async function checkFluxConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.nvidiaApiKey) {
    return { ok: false, message: 'NVIDIA_API_KEY not set on server' };
  }

  try {
    await invokeFlux({
      prompt: 'a simple blue circle on white background, no text, family-friendly',
      width: FLUX_WIDTH,
      height: FLUX_HEIGHT,
      seed: 42,
      steps: FLUX_STEPS,
    });

    return { ok: true, message: 'FLUX image API working' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
