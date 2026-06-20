import { z } from 'zod';

export const MOTION_PRESETS = [
  'cinematic',
  'horror',
  'space',
  'history',
  'mystery',
  'epic',
] as const;

export type MotionPreset = (typeof MOTION_PRESETS)[number];

export const kimiSceneSchema = z.object({
  id: z.number().optional(),
  duration: z.number().int().positive().max(30),
  narration: z.string().optional(),
  prompt: z.string().optional(),
  imagePrompt: z.string().optional(),
  imagePrompts: z.array(z.string()).optional(),
  needs_lip_sync: z.boolean().optional().default(false),
  style: z.string().optional(),
  motionPreset: z.string().optional(),
});

export const kimiScriptSchema = z
  .object({
    title: z.string().optional(),
    newTitle: z.string().optional(),
    hook: z.string().optional(),
    newHook: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    narration: z.string().min(1),
    thumbnailPrompt: z.string().min(1),
    scenes: z.array(kimiSceneSchema).min(3).max(10),
  })
  .transform((raw) => {
    const title = (raw.newTitle ?? raw.title ?? '').trim();
    const hook = (raw.newHook ?? raw.hook ?? '').trim();

    if (!title) {
      throw new Error('Kimi response missing title');
    }

    const scenes = raw.scenes.map((scene, index) => {
      const basePrompt = (scene.imagePrompt ?? scene.prompt ?? '').trim();
      if (!basePrompt) {
        throw new Error(`Kimi scene ${index + 1} missing imagePrompt`);
      }

      const imagePrompts =
        scene.imagePrompts?.map((p) => p.trim()).filter(Boolean) ??
        buildThreeImagePrompts(basePrompt);

      const motionPreset = normalizeMotionPreset(scene.motionPreset ?? scene.style);

      return {
        order: scene.id ?? index + 1,
        duration: scene.duration,
        narration: scene.narration?.trim() ?? '',
        imagePrompt: basePrompt,
        imagePrompts,
        needsLipSync: scene.needs_lip_sync ?? false,
        style: scene.style ?? 'b-roll',
        motionPreset,
      };
    });

    return {
      title,
      hook,
      description: raw.description?.trim() ?? '',
      tags: raw.tags ?? [],
      narration: raw.narration.trim(),
      thumbnailPrompt: raw.thumbnailPrompt.trim(),
      scenes,
    };
  });

function buildThreeImagePrompts(base: string): string[] {
  return [
    `${base}, wide establishing shot, slow cinematic framing`,
    `${base}, dramatic medium shot, subject centered, depth of field`,
    `${base}, intense close-up detail, emotional focus, shallow depth`,
  ];
}

function normalizeMotionPreset(raw?: string): MotionPreset {
  const value = (raw ?? 'cinematic').toLowerCase();

  if (value.includes('horror') || value.includes('dark')) {
    return 'horror';
  }

  if (value.includes('space') || value.includes('cosmic')) {
    return 'space';
  }

  if (value.includes('history') || value.includes('ancient')) {
    return 'history';
  }

  if (value.includes('mystery')) {
    return 'mystery';
  }

  if (value.includes('epic')) {
    return 'epic';
  }

  return 'cinematic';
}

export type KimiScript = z.infer<typeof kimiScriptSchema>;

export type YouTubeSource = {
  videoId: string;
  title: string;
  transcript: string;
};

export type ProjectScript = KimiScript & {
  sourceTitle: string;
  sourceTranscript: string;
  sourceVideoId: string;
  generatedAt: string;
};

export type SceneScript = KimiScript['scenes'][number];
