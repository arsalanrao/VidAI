import { env } from '../../config/env.js';

/** Verified Magpie en-US voices (NVIDIA Build UI: Mia, Aria, Jason, Leo, …). */
export const MAGPIE_SAFE_VOICES_EN_US = [
  'Magpie-Multilingual.EN-US.Mia',
  'Magpie-Multilingual.EN-US.Aria',
  'Magpie-Multilingual.EN-US.Jason',
  'Magpie-Multilingual.EN-US.Leo',
] as const;

const SHORT_TO_FULL_EN_US: Record<string, string> = {
  Mia: 'Magpie-Multilingual.EN-US.Mia',
  Aria: 'Magpie-Multilingual.EN-US.Aria',
  Jason: 'Magpie-Multilingual.EN-US.Jason',
  Leo: 'Magpie-Multilingual.EN-US.Leo',
  Diego: 'Magpie-Multilingual.ES-US.Diego',
  Isabela: 'Magpie-Multilingual.ES-US.Isabela',
  Sofia: 'Magpie-Multilingual.ES-US.Sofia',
  Pascal: 'Magpie-Multilingual.FR-FR.Pascal',
  Louise: 'Magpie-Multilingual.FR-FR.Louise',
  Ray: 'Magpie-Multilingual.EN-US.Ray',
};

function languageTag(languageCode: string): string {
  return languageCode
    .split('-')
    .map((part) => part.toUpperCase())
    .join('-');
}

/** Map UI character names to full Riva voice ids required by Magpie HTTP/gRPC. */
export function normalizeMagpieVoice(voice: string, languageCode = env.ttsLanguage): string {
  const trimmed = voice.trim();

  if (!trimmed) {
    return MAGPIE_SAFE_VOICES_EN_US[0];
  }

  if (trimmed.startsWith('Chatterbox-')) {
    return trimmed.toLowerCase().includes('female')
      ? 'Magpie-Multilingual.EN-US.Aria'
      : 'Magpie-Multilingual.EN-US.Mia';
  }

  if (trimmed.startsWith('Magpie-Multilingual.')) {
    if (trimmed.includes('.Emma')) {
      return 'Magpie-Multilingual.EN-US.Mia';
    }
    return trimmed;
  }

  const shortName = trimmed.split('.')[0] ?? trimmed;
  const mapped = SHORT_TO_FULL_EN_US[shortName];

  if (mapped) {
    return mapped;
  }

  return `Magpie-Multilingual.${languageTag(languageCode)}.${shortName}`;
}

/** Ordered voice attempts: preferred first, then safe fallbacks (rotated on retry). */
export function magpieVoiceFallbackChain(
  preferredVoice: string,
  recoveryAttempt = 0,
): string[] {
  const normalized = normalizeMagpieVoice(preferredVoice);
  const pool = MAGPIE_SAFE_VOICES_EN_US.filter((voice) => voice !== normalized);
  const offset = recoveryAttempt % pool.length;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];

  return [normalized, ...rotated];
}

export function isMagpieVoiceError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('model is not available') ||
    lower.includes('voice') && lower.includes('not found') ||
    lower.includes('subvoice requested not found')
  );
}
