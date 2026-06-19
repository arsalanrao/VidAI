import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { generateKimiScript } from '../ai/kimi.service.js';
import { extractYouTubeSource } from '../youtube/extract.service.js';
import type { ProjectScript } from '../../types/script.types.js';

export async function runScriptStage(projectId: string): Promise<ProjectScript> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const source = await extractYouTubeSource(project.youtubeUrl);
  const script = await generateKimiScript(source);

  const projectScript: ProjectScript = {
    ...script,
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
          })),
        },
      },
    });
  });

  return projectScript;
}
