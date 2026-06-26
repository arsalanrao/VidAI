import {
  FluxContentFilteredError,
  generateFluxImageWithRetry,
} from './flux.service.js';
import { generateQwenImage, isQwenImageConfigured } from './qwen-image.service.js';

export { FluxContentFilteredError, FluxSceneFilteredError } from './flux.service.js';
export { FLUX_MAX_ATTEMPTS } from './flux.service.js';

/**
 * Try FLUX first; when NVIDIA blocks the prompt (CONTENT_FILTERED), fall back to Qwen-Image.
 */
export async function generateImageWithRetry(
  prompt: string,
  options?: { maxAttempts?: number; seed?: number; startAttempt?: number },
): Promise<Buffer> {
  try {
    return await generateFluxImageWithRetry(prompt, options);
  } catch (err) {
    if (!(err instanceof FluxContentFilteredError) || !isQwenImageConfigured()) {
      throw err;
    }

    const promptsToTry = [prompt, err.suggestedPrompt].filter(
      (value, index, list) => value.trim().length > 0 && list.indexOf(value) === index,
    );

    let lastQwenError: Error | undefined;

    for (const qwenPrompt of promptsToTry) {
      try {
        console.warn(
          `[image] FLUX content filtered — trying Qwen fallback for prompt (${qwenPrompt.slice(0, 80)}…)`,
        );
        return await generateQwenImage(qwenPrompt);
      } catch (qwenErr) {
        lastQwenError = qwenErr instanceof Error ? qwenErr : new Error(String(qwenErr));
        console.warn(`[image] Qwen fallback failed: ${lastQwenError.message}`);
      }
    }

    if (lastQwenError) {
      console.warn('[image] Qwen fallback exhausted — surfacing FLUX content-filter recovery UI');
    }

    throw err;
  }
}
