import { env } from '../../config/env.js';

const FLUX_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';

// Vertical Shorts — 768×1344 (NVIDIA "16:9" portrait preset)
export const FLUX_SHORTS_WIDTH = 768;
export const FLUX_SHORTS_HEIGHT = 1344;

type FluxResponse = {
  artifacts?: Array<{
    base64?: string;
    finishReason?: string;
    seed?: number;
  }>;
  detail?: string;
  error?: string;
};

function ensureVerticalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('9:16') && lower.includes('no text')) {
    return trimmed;
  }

  return `${trimmed}, vertical 9:16 aspect ratio, no text, no watermark`;
}

function getErrorMessage(data: FluxResponse, status: number): string {
  return data.detail ?? data.error ?? `FLUX API error (${status})`;
}

export async function generateFluxImage(prompt: string, seed = 0): Promise<Buffer> {
  if (!env.nvidiaApiKey) {
    throw new Error('NVIDIA_API_KEY not configured (required for FLUX images)');
  }

  const response = await fetch(FLUX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${env.nvidiaApiKey}`,
    },
    body: JSON.stringify({
      prompt: ensureVerticalPrompt(prompt),
      width: FLUX_SHORTS_WIDTH,
      height: FLUX_SHORTS_HEIGHT,
      steps: 4,
      seed,
      mode: 'Image Generation',
    }),
  });

  const data = (await response.json().catch(() => ({}))) as FluxResponse;

  if (!response.ok) {
    throw new Error(`FLUX: ${getErrorMessage(data, response.status)}`);
  }

  const artifact = data.artifacts?.[0];

  if (!artifact?.base64) {
    throw new Error('FLUX returned no image data');
  }

  if (artifact.finishReason && artifact.finishReason !== 'SUCCESS') {
    throw new Error(`FLUX generation failed: ${artifact.finishReason}`);
  }

  return Buffer.from(artifact.base64, 'base64');
}

export async function checkFluxConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.nvidiaApiKey) {
    return { ok: false, message: 'NVIDIA_API_KEY not set on server' };
  }

  // Lightweight auth check — same key as Kimi/FLUX on NVIDIA Build
  const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: `Bearer ${env.nvidiaApiKey}` },
  });

  if (response.ok) {
    return { ok: true, message: 'NVIDIA API key valid for FLUX' };
  }

  return { ok: false, message: `NVIDIA API check failed (${response.status})` };
}
