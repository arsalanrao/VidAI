import { env } from '../../config/env.js';

// NVIDIA Build — https://build.nvidia.com/black-forest-labs/flux_2-klein-4b
const FLUX_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';

// Match NVIDIA docs sample (1024×1024). Vertical framing via prompt for Shorts.
export const FLUX_WIDTH = 1024;
export const FLUX_HEIGHT = 1024;
export const FLUX_STEPS = 4;

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

function ensureVerticalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('9:16') && lower.includes('no text')) {
    return trimmed;
  }

  return `${trimmed}, vertical 9:16 composition, no text, no watermark`;
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

    throw new Error(
      `FLUX invocation failed (${response.status}): ${formatNvidiaError(errData, response.status)}`,
    );
  }

  let data: FluxResponse;

  try {
    data = JSON.parse(rawText) as FluxResponse;
  } catch {
    throw new Error('FLUX returned invalid JSON response');
  }

  const artifact = data.artifacts?.[0];

  if (!artifact?.base64) {
    throw new Error(`FLUX returned no image — ${formatNvidiaError(data, response.status)}`);
  }

  if (artifact.finishReason && artifact.finishReason !== 'SUCCESS') {
    throw new Error(`FLUX generation failed: ${artifact.finishReason}`);
  }

  return Buffer.from(artifact.base64, 'base64');
}

export async function generateFluxImage(prompt: string, seed = 0): Promise<Buffer> {
  return invokeFlux({
    prompt: ensureVerticalPrompt(prompt),
    width: FLUX_WIDTH,
    height: FLUX_HEIGHT,
    seed,
    steps: FLUX_STEPS,
  });
}

export async function checkFluxConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.nvidiaApiKey) {
    return { ok: false, message: 'NVIDIA_API_KEY not set on server' };
  }

  try {
    await invokeFlux({
      prompt: 'a simple blue circle on white background, no text',
      width: FLUX_WIDTH,
      height: FLUX_HEIGHT,
      seed: 0,
      steps: FLUX_STEPS,
    });

    return { ok: true, message: 'FLUX image API working' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
