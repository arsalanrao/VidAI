import { z } from 'zod';
import {
  buildMagpieVoiceId,
  MAGPIE_CHARACTERS,
  MAGPIE_EMOTIONS,
  type MagpieCharacter,
  type MagpieEmotion,
} from '../services/ai/magpie-voices.js';

export const VISUAL_THEMES = [
  'cinematic',
  'horror',
  'space',
  'ancient_history',
  'fantasy',
  'cyberpunk',
] as const;

export const MOTION_STYLES = [
  'slow',
  'fast',
  'epic',
  'dramatic',
  'handheld',
  'movie_camera',
] as const;

/** @deprecated Legacy abstract presets — migrated to Magpie characters on read. */
export const LEGACY_VOICE_PRESETS = [
  'male_deep',
  'female_calm',
  'narrator',
  'old_man',
  'robotic',
  'story_teller',
] as const;

export const VOICE_PRESETS = MAGPIE_CHARACTERS;

export const CAPTION_STYLES = [
  'mrbeast',
  'magnatesmedia',
  'dark_mystery',
  'history',
  'tiktok_viral',
  'anime',
  'realistic',
] as const;

export type VisualTheme = (typeof VISUAL_THEMES)[number];
export type MotionStyle = (typeof MOTION_STYLES)[number];
export type VoicePreset = MagpieCharacter;
export type VoiceEmotion = MagpieEmotion;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export type ProjectPreferences = {
  visualTheme: VisualTheme;
  motionStyle: MotionStyle;
  voicePreset: VoicePreset;
  voiceEmotion: VoiceEmotion;
  captionStyle: CaptionStyle;
};

const LEGACY_VOICE_MAP: Record<
  (typeof LEGACY_VOICE_PRESETS)[number],
  { character: MagpieCharacter; emotion: MagpieEmotion }
> = {
  male_deep: { character: 'leo', emotion: 'default' },
  female_calm: { character: 'aria', emotion: 'calm' },
  narrator: { character: 'mia', emotion: 'default' },
  old_man: { character: 'leo', emotion: 'default' },
  robotic: { character: 'jason', emotion: 'neutral' },
  story_teller: { character: 'mia', emotion: 'calm' },
};

function migrateVoicePreset(raw: unknown): MagpieCharacter {
  if (typeof raw !== 'string') {
    return 'mia';
  }

  if (MAGPIE_CHARACTERS.includes(raw as MagpieCharacter)) {
    return raw as MagpieCharacter;
  }

  const legacy = LEGACY_VOICE_MAP[raw as (typeof LEGACY_VOICE_PRESETS)[number]];
  return legacy?.character ?? 'mia';
}

function migrateVoiceEmotion(raw: unknown, voicePreset: unknown): MagpieEmotion {
  if (typeof raw === 'string' && MAGPIE_EMOTIONS.includes(raw as MagpieEmotion)) {
    return raw as MagpieEmotion;
  }

  if (typeof voicePreset === 'string') {
    const legacy = LEGACY_VOICE_MAP[voicePreset as (typeof LEGACY_VOICE_PRESETS)[number]];
    if (legacy) {
      return legacy.emotion;
    }
  }

  return 'default';
}

export const projectPreferencesSchema = z
  .object({
    visualTheme: z.enum(VISUAL_THEMES).default('cinematic'),
    motionStyle: z.enum(MOTION_STYLES).default('movie_camera'),
    voicePreset: z.string().default('mia'),
    voiceEmotion: z.string().optional(),
    captionStyle: z.enum(CAPTION_STYLES).default('mrbeast'),
  })
  .transform((raw) => {
    const voicePreset = migrateVoicePreset(raw.voicePreset);
    const voiceEmotion = migrateVoiceEmotion(raw.voiceEmotion, raw.voicePreset);

    return {
      visualTheme: raw.visualTheme,
      motionStyle: raw.motionStyle,
      voicePreset,
      voiceEmotion,
      captionStyle: raw.captionStyle,
    } satisfies ProjectPreferences;
  });

export const DEFAULT_PREFERENCES: ProjectPreferences = {
  visualTheme: 'cinematic',
  motionStyle: 'movie_camera',
  voicePreset: 'mia',
  voiceEmotion: 'default',
  captionStyle: 'mrbeast',
};

export function parseProjectPreferences(raw: unknown): ProjectPreferences {
  return projectPreferencesSchema.parse(raw ?? DEFAULT_PREFERENCES);
}

export function readProjectPreferences(project: {
  preferences?: unknown;
  script?: unknown;
}): ProjectPreferences {
  if (project.preferences) {
    return parseProjectPreferences(project.preferences);
  }

  const script = project.script;

  if (script && typeof script === 'object' && 'preferences' in script) {
    return parseProjectPreferences((script as Record<string, unknown>).preferences);
  }

  return DEFAULT_PREFERENCES;
}

export function visualThemeLabel(theme: VisualTheme): string {
  const labels: Record<VisualTheme, string> = {
    cinematic: 'Cinematic',
    horror: 'Horror',
    space: 'Space',
    ancient_history: 'Ancient History',
    fantasy: 'Fantasy',
    cyberpunk: 'Cyberpunk',
  };

  return labels[theme];
}

export function motionStyleToPreset(style: MotionStyle): string {
  const map: Record<MotionStyle, string> = {
    slow: 'cinematic',
    fast: 'epic',
    epic: 'epic',
    dramatic: 'mystery',
    handheld: 'horror',
    movie_camera: 'cinematic',
  };

  return map[style];
}

export function visualThemeToMotionPreset(theme: VisualTheme): string {
  const map: Record<VisualTheme, string> = {
    cinematic: 'cinematic',
    horror: 'horror',
    space: 'space',
    ancient_history: 'history',
    fantasy: 'fantasy',
    cyberpunk: 'cyberpunk',
  };

  return map[theme];
}

export type TtsVoiceConfig = {
  magpieCharacter: MagpieCharacter;
  magpieEmotion: MagpieEmotion;
  magpieVoice: string;
  chatterboxVoice: string;
  openaiVoice?: string;
};

const CHATTERBOX_BY_CHARACTER: Record<MagpieCharacter, string> = {
  mia: 'Chatterbox-Multilingual.en-US.Female',
  aria: 'Chatterbox-Multilingual.en-US.Female',
  jason: 'Chatterbox-Multilingual.en-US.Male',
  leo: 'Chatterbox-Multilingual.en-US.Male',
  ray: 'Chatterbox-Multilingual.en-US.Male',
};

export function preferencesToTtsVoice(preferences: Pick<ProjectPreferences, 'voicePreset' | 'voiceEmotion'>): TtsVoiceConfig {
  const character = preferences.voicePreset;
  const emotion = preferences.voiceEmotion;

  return {
    magpieCharacter: character,
    magpieEmotion: emotion,
    magpieVoice: buildMagpieVoiceId(character, emotion),
    chatterboxVoice: CHATTERBOX_BY_CHARACTER[character],
    openaiVoice: 'alloy',
  };
}

/** @deprecated Use preferencesToTtsVoice */
export function voicePresetToTtsVoice(preset: VoicePreset, emotion: VoiceEmotion = 'default'): TtsVoiceConfig {
  return preferencesToTtsVoice({ voicePreset: preset, voiceEmotion: emotion });
}
