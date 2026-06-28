import { prisma } from '../../db/client.js';
import { generateNarrationAudio } from '../ai/tts.service.js';
import { projectKey, uploadObject } from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';
import type { ProjectScript } from '../../types/script.types.js';
import {
  parseProjectPreferences,
  preferencesToTtsVoice,
  readProjectPreferences,
  type VoiceEmotion,
  type VoicePreset,
} from '../../types/project-preferences.types.js';

function parseProjectScript(script: unknown): ProjectScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Project script missing — run script stage first');
  }

  return script as ProjectScript;
}

export async function runTtsStage(
  projectId: string,
  options?: {
    voicePreset?: VoicePreset;
    voiceEmotion?: VoiceEmotion;
    recoveryAttempt?: number;
  },
): Promise<{ narrationKey: string }> {
  if (!r2Configured) {
    throw new Error('R2 not configured — add R2 env vars to store narration audio');
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const script = parseProjectScript(project.script);
  const preferences = readProjectPreferences(project);
  const voicePreset = options?.voicePreset ?? preferences.voicePreset;
  const voiceEmotion = options?.voiceEmotion ?? preferences.voiceEmotion;
  const voiceConfig = preferencesToTtsVoice({ voicePreset, voiceEmotion });

  const prefsChanged =
    voicePreset !== preferences.voicePreset || voiceEmotion !== preferences.voiceEmotion;

  if (prefsChanged) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        preferences: parseProjectPreferences({
          ...preferences,
          voicePreset,
          voiceEmotion,
        }),
      },
    });
  }

  if (!script.narration?.trim()) {
    throw new Error('Script has no narration text for TTS');
  }

  const audioBuffer = await generateNarrationAudio(script.narration, {
    voiceConfig,
    recoveryAttempt: options?.recoveryAttempt ?? 0,
  });
  const narrationKey = projectKey(projectId, 'narration.wav');

  await uploadObject({
    key: narrationKey,
    body: audioBuffer,
    contentType: 'audio/wav',
    cacheControl: 'public, max-age=31536000',
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      narrationUrl: narrationKey,
      status: 'narration_ready',
      errorMessage: null,
    },
  });

  return { narrationKey };
}
