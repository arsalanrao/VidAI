import { env } from '../../config/env.js';

/** Magpie UI characters (English US) — https://build.nvidia.com/nvidia/magpie-tts-multilingual */
export const MAGPIE_CHARACTERS = ['mia', 'aria', 'jason', 'leo', 'ray'] as const;

/** Magpie UI emotions — Default skips subvoice suffix. */
export const MAGPIE_EMOTIONS = ['default', 'neutral', 'calm', 'happy', 'angry'] as const;

export type MagpieCharacter = (typeof MAGPIE_CHARACTERS)[number];
export type MagpieEmotion = (typeof MAGPIE_EMOTIONS)[number];

export const MAGPIE_SAFE_VOICES_EN_US = [
  'Magpie-Multilingual.EN-US.Mia',
  'Magpie-Multilingual.EN-US.Aria',
  'Magpie-Multilingual.EN-US.Jason',
  'Magpie-Multilingual.EN-US.Leo',
  'Magpie-Multilingual.EN-US.Ray',
] as const;

const CHARACTER_LANGUAGE: Record<MagpieCharacter, string> = {
  mia: 'en-US',
  aria: 'en-US',
  jason: 'en-US',
  leo: 'en-US',
  ray: 'en-US',
};

const CHARACTER_LABEL: Record<MagpieCharacter, string> = {
  mia: 'Mia',
  aria: 'Aria',
  jason: 'Jason',
  leo: 'Leo',
  ray: 'Ray',
};

const EMOTION_API: Record<MagpieEmotion, string | null> = {
  default: null,
  neutral: 'Neutral',
  calm: 'Calm',
  happy: 'Happy',
  angry: 'Angry',
};

function languageTag(languageCode: string): string {
  return languageCode
    .split('-')
    .map((part) => part.toUpperCase())
    .join('-');
}

export function buildMagpieVoiceId(
  character: MagpieCharacter,
  emotion: MagpieEmotion = 'default',
  languageCode = env.ttsLanguage,
): string {
  const label = CHARACTER_LABEL[character];
  const base = `Magpie-Multilingual.${languageTag(languageCode)}.${label}`;
  const emotionSuffix = EMOTION_API[emotion];

  if (!emotionSuffix) {
    return base;
  }

  return `${base}.${emotionSuffix}`;
}

export function characterLanguage(character: MagpieCharacter): string {
  return CHARACTER_LANGUAGE[character] ?? env.ttsLanguage;
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

  const lower = trimmed.toLowerCase();
  if (MAGPIE_CHARACTERS.includes(lower as MagpieCharacter)) {
    return buildMagpieVoiceId(lower as MagpieCharacter, 'default', languageCode);
  }

  const shortName = trimmed.split('.')[0] ?? trimmed;
  const cap = shortName.charAt(0).toUpperCase() + shortName.slice(1).toLowerCase();
  return `Magpie-Multilingual.${languageTag(languageCode)}.${cap}`;
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
    (lower.includes('voice') && lower.includes('not found')) ||
    lower.includes('subvoice requested not found')
  );
}

export function magpieEmotionForApi(emotion: MagpieEmotion): string | undefined {
  const value = EMOTION_API[emotion];
  return value ?? undefined;
}
