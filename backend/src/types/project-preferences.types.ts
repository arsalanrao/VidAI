import { z } from 'zod';

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

export const VOICE_PRESETS = [
  'male_deep',
  'female_calm',
  'narrator',
  'old_man',
  'robotic',
  'story_teller',
] as const;

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
export type VoicePreset = (typeof VOICE_PRESETS)[number];
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export type ProjectPreferences = {
  visualTheme: VisualTheme;
  motionStyle: MotionStyle;
  voicePreset: VoicePreset;
  captionStyle: CaptionStyle;
};

export const projectPreferencesSchema = z.object({
  visualTheme: z.enum(VISUAL_THEMES).default('cinematic'),
  motionStyle: z.enum(MOTION_STYLES).default('movie_camera'),
  voicePreset: z.enum(VOICE_PRESETS).default('narrator'),
  captionStyle: z.enum(CAPTION_STYLES).default('mrbeast'),
});

export const DEFAULT_PREFERENCES: ProjectPreferences = {
  visualTheme: 'cinematic',
  motionStyle: 'movie_camera',
  voicePreset: 'narrator',
  captionStyle: 'mrbeast',
};

export function parseProjectPreferences(raw: unknown): ProjectPreferences {
  return projectPreferencesSchema.parse(raw ?? DEFAULT_PREFERENCES);
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

export function voicePresetToTtsVoice(preset: VoicePreset): { voice: string; openaiVoice?: string } {
  const map: Record<VoicePreset, { voice: string; openaiVoice?: string }> = {
    male_deep: { voice: 'Chatterbox-Multilingual.en-US.Male', openaiVoice: 'onyx' },
    female_calm: { voice: 'Magpie-Multilingual.EN-US.Aria', openaiVoice: 'nova' },
    narrator: { voice: 'Magpie-Multilingual.EN-US.Emma', openaiVoice: 'alloy' },
    old_man: { voice: 'Chatterbox-Multilingual.en-US.Male', openaiVoice: 'fable' },
    robotic: { voice: 'Magpie-Multilingual.EN-US.Aria', openaiVoice: 'echo' },
    story_teller: { voice: 'Magpie-Multilingual.EN-US.Emma', openaiVoice: 'shimmer' },
  };

  return map[preset];
}
