import { z } from 'zod';

export const kimiSceneSchema = z.object({
  id: z.number().optional(),
  duration: z.number().int().positive().max(30),
  narration: z.string().optional(),
  prompt: z.string().optional(),
  imagePrompt: z.string().optional(),
  needs_lip_sync: z.boolean().optional().default(false),
  style: z.string().optional(),
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
      const imagePrompt = (scene.imagePrompt ?? scene.prompt ?? '').trim();
      if (!imagePrompt) {
        throw new Error(`Kimi scene ${index + 1} missing imagePrompt`);
      }

      return {
        order: scene.id ?? index + 1,
        duration: scene.duration,
        narration: scene.narration?.trim() ?? '',
        imagePrompt,
        needsLipSync: scene.needs_lip_sync ?? false,
        style: scene.style ?? 'b-roll',
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
