import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { generateKimiScript } from '../ai/kimi.service.js';
import { extractYouTubeSource } from '../youtube/extract.service.js';
import type { ProjectScript } from '../../types/script.types.js';
import {
  motionStyleToPreset,
  readProjectPreferences,
  visualThemeToMotionPreset,
} from '../../types/project-preferences.types.js';
import type { MotionPreset } from '../../types/script.types.js';

function resolveSceneMotionPreset(
  preferences: ReturnType<typeof readProjectPreferences>,
  scenePreset: string,
): MotionPreset {
  const fromMotion = motionStyleToPreset(preferences.motionStyle) as MotionPreset;
  const fromTheme = visualThemeToMotionPreset(preferences.visualTheme) as MotionPreset;
  const kimiPreset = (scenePreset || fromTheme) as MotionPreset;

  if (preferences.motionStyle !== 'movie_camera') {
    return fromMotion;
  }

  return kimiPreset;
}

export async function runScriptStage(projectId: string): Promise<ProjectScript> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const preferences = readProjectPreferences(project);
  const source = await extractYouTubeSource(project.youtubeUrl);
  const script = await generateKimiScript(source, preferences);

  const projectScript: ProjectScript & { preferences: typeof preferences } = {
    ...script,
    preferences,
    sourceTitle: source.title,
    sourceTranscript: source.transcript,
    sourceVideoId: source.videoId,
    generatedAt: new Date().toISOString(),
  };

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.scene.deleteMany({ where: { projectId } });

    await tx.project.update({
      where: { id: projectId },
      data: {
        title: script.title,
        status: 'script_ready',
        errorMessage: null,
        script: projectScript,
        scenes: {
          create: script.scenes.map((scene, index) => ({
            order: index,
            prompt: scene.imagePrompt,
            duration: scene.duration,
            motionPreset: resolveSceneMotionPreset(preferences, scene.motionPreset),
          })),
        },
      },
    });
  });

  return projectScript;
}
