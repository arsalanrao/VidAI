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

export type VoicePreset =
  | 'male_deep'
  | 'female_calm'
  | 'narrator'
  | 'old_man'
  | 'robotic'
  | 'story_teller';

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
  { id: 'male_deep', label: 'Male Deep' },
  { id: 'female_calm', label: 'Female Calm' },
  { id: 'narrator', label: 'Narrator' },
  { id: 'old_man', label: 'Old Man' },
  { id: 'robotic', label: 'Robotic' },
  { id: 'story_teller', label: 'Story Teller' },
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
  voicePreset: 'narrator',
  captionStyle: 'mrbeast',
};
