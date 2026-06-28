export type VisualTheme =
  | 'cinematic'
  | 'horror'
  | 'space'
  | 'ancient_history'
  | 'fantasy'
  | 'cyberpunk';

export type MotionStyle =
  | 'slow'
  | 'fast'
  | 'epic'
  | 'dramatic'
  | 'handheld'
  | 'movie_camera';

/** Magpie TTS characters (English US) — matches NVIDIA Build UI */
export type VoicePreset = 'mia' | 'aria' | 'jason' | 'leo' | 'ray';

/** Magpie TTS emotions — matches NVIDIA Build UI */
export type VoiceEmotion = 'default' | 'neutral' | 'calm' | 'happy' | 'angry';

export type CaptionStyle =
  | 'mrbeast'
  | 'magnatesmedia'
  | 'dark_mystery'
  | 'history'
  | 'tiktok_viral'
  | 'anime'
  | 'realistic';

export type ProjectPreferences = {
  visualTheme: VisualTheme;
  motionStyle: MotionStyle;
  voicePreset: VoicePreset;
  voiceEmotion: VoiceEmotion;
  captionStyle: CaptionStyle;
};

export type OptionItem<T extends string> = {
  id: T;
  label: string;
};

export const VISUAL_THEMES: OptionItem<VisualTheme>[] = [
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'horror', label: 'Horror' },
  { id: 'space', label: 'Space' },
  { id: 'ancient_history', label: 'Ancient History' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
];

export const MOTION_STYLES: OptionItem<MotionStyle>[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'fast', label: 'Fast' },
  { id: 'epic', label: 'Epic' },
  { id: 'dramatic', label: 'Dramatic' },
  { id: 'handheld', label: 'Handheld' },
  { id: 'movie_camera', label: 'Movie Camera' },
];

export const VOICE_PRESETS: OptionItem<VoicePreset>[] = [
  { id: 'mia', label: 'Mia' },
  { id: 'aria', label: 'Aria' },
  { id: 'jason', label: 'Jason' },
  { id: 'leo', label: 'Leo' },
  { id: 'ray', label: 'Ray' },
];

export const VOICE_EMOTIONS: OptionItem<VoiceEmotion>[] = [
  { id: 'default', label: 'Default' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'angry', label: 'Angry' },
];

export const CAPTION_STYLES: OptionItem<CaptionStyle>[] = [
  { id: 'mrbeast', label: 'MrBeast' },
  { id: 'magnatesmedia', label: 'MagnatesMedia' },
  { id: 'dark_mystery', label: 'Dark Mystery' },
  { id: 'history', label: 'History' },
  { id: 'tiktok_viral', label: 'TikTok Viral' },
  { id: 'anime', label: 'Anime' },
  { id: 'realistic', label: 'Realistic' },
];

export const DEFAULT_PREFERENCES: ProjectPreferences = {
  visualTheme: 'cinematic',
  motionStyle: 'movie_camera',
  voicePreset: 'mia',
  voiceEmotion: 'default',
  captionStyle: 'mrbeast',
};
