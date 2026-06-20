/** Render API — change if you use a custom domain later */
export const API_BASE_URL = 'https://vidai-nw8e.onrender.com';

export const POLL_INTERVAL_MS = 4000;
/** Slower polling while FFmpeg runs — reduces load on Render free tier */
export const POLL_INTERVAL_RENDERING_MS = 12000;

export function pollIntervalForStatus(status: string | undefined): number {
  if (status === 'rendering' || status === 'processing' || status === 'queued') {
    return POLL_INTERVAL_RENDERING_MS;
  }

  return POLL_INTERVAL_MS;
}
