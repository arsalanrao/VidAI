import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { CaptionStyle } from '../../types/project-preferences.types.js';
import { getAudioDurationSeconds } from './ffmpeg.util.js';

export type CaptionCue = {
  startSec: number;
  endSec: number;
  text: string;
};

export type SceneCaptionInput = {
  narration: string;
  durationSec: number;
};

/** Build word-level ASS captions from scene narration lines (Whisper-ready fallback). */
export async function buildSceneCaptionsAss(options: {
  scenes: SceneCaptionInput[];
  totalAudioSec: number;
  audioPath: string;
  captionStyle?: CaptionStyle;
}): Promise<string> {
  const measuredDuration = await getAudioDurationSeconds(options.audioPath);
  const totalDuration = measuredDuration > 0 ? measuredDuration : options.totalAudioSec;

  const cues = buildWordCuesFromScenes(options.scenes, totalDuration);
  const ass = cuesToAss(cues, options.captionStyle ?? 'mrbeast');

  const assPath = join(tmpdir(), `vidaipro-captions-${randomUUID()}.ass`);
  await writeFile(assPath, ass, 'utf8');

  return assPath;
}

export function buildWordCuesFromScenes(
  scenes: SceneCaptionInput[],
  totalDurationSec: number,
): CaptionCue[] {
  const sceneTexts = scenes.map((scene) => ({
    words: scene.narration.trim().split(/\s+/).filter(Boolean),
    durationSec: scene.durationSec,
  }));

  const totalWords = sceneTexts.reduce((sum, scene) => sum + scene.words.length, 0) || 1;
  const secPerWord = totalDurationSec / totalWords;

  const cues: CaptionCue[] = [];
  let cursor = 0;

  for (const scene of sceneTexts) {
    for (const word of scene.words) {
      const startSec = cursor;
      const endSec = Math.min(totalDurationSec, cursor + secPerWord);
      cues.push({
        startSec,
        endSec,
        text: word.toUpperCase(),
      });
      cursor = endSec;
    }
  }

  return cues;
}

function captionStyleAss(style: CaptionStyle): string {
  const styles: Record<CaptionStyle, string> = {
    mrbeast: 'Style: Default,Arial Black,72,&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,120,1',
    magnatesmedia:
      'Style: Default,Impact,68,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,100,1',
    dark_mystery:
      'Style: Default,Arial Black,64,&H000066FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,110,1',
    history:
      'Style: Default,Georgia,60,&H00E6D5B8,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,100,1',
    tiktok_viral:
      'Style: Default,Arial Black,76,&H00FFFFFF,&H000000FF,&H00FF00FF,&H96000000,-1,0,0,0,100,100,0,0,1,5,0,2,40,40,130,1',
    anime:
      'Style: Default,Arial Black,70,&H00FF99FF,&H000000FF,&H000000FF,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,40,40,120,1',
    realistic:
      'Style: Default,Helvetica,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,90,1',
  };

  return styles[style];
}

function cuesToAss(cues: CaptionCue[], style: CaptionStyle): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1536
PlayResY: 2730

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${captionStyleAss(style)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = cues.map((cue) => {
    const start = formatAssTime(cue.startSec);
    const end = formatAssTime(cue.endSec);
    const pop = `{\\fscx115\\fscy115\\t(0,120,\\fscx100\\fscy100)}${escapeAssText(cue.text)}`;

    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${pop}`;
  });

  return `${header}${lines.join('\n')}\n`;
}

function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\N');
}
