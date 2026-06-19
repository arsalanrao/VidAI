import { env } from '../../config/env.js';
import { kimiScriptSchema, type KimiScript, type YouTubeSource } from '../../types/script.types.js';

const MOONSHOT_API_BASE = 'https://api.moonshot.ai/v1';
const KIMI_MODEL = 'kimi-k2.6';

const SYSTEM_PROMPT = `You are a viral YouTube Shorts creative director.
Produce COMPLETELY ORIGINAL content inspired by the source video structure — never copy sentences verbatim.
Output ONLY valid JSON matching this schema:
{
  "newTitle": "string — catchy Shorts title under 70 chars",
  "newHook": "string — first 2 seconds hook",
  "description": "string — YouTube description",
  "tags": ["string"],
  "narration": "string — full voiceover script, 30-59 seconds when read aloud",
  "thumbnailPrompt": "string — dramatic thumbnail, vertical 9:16, no text",
  "scenes": [
    {
      "id": 1,
      "duration": 4,
      "narration": "string — line for this scene",
      "imagePrompt": "string — vertical 9:16, no text, cinematic",
      "needs_lip_sync": false,
      "style": "b-roll"
    }
  ]
}
Rules:
- 5-8 scenes total
- Hook must land in the first 2 seconds
- imagePrompt MUST include "vertical 9:16, no text"
- needs_lip_sync: true ONLY for direct talking-head / face-to-camera scenes
- Total scene durations should roughly match a 30-59 second Short`;

function buildUserPrompt(source: YouTubeSource): string {
  const trimmedTranscript =
    source.transcript.length > 12_000
      ? `${source.transcript.slice(0, 12_000)}…`
      : source.transcript;

  return `Rewrite this viral YouTube Short into a fresh original Shorts package.

SOURCE TITLE: ${source.title}

SOURCE TRANSCRIPT:
${trimmedTranscript}

Return JSON only. Make it feel like a new viral Short — stronger hook, tighter pacing, original wording.`;
}

type MoonshotResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function generateKimiScript(source: YouTubeSource): Promise<KimiScript> {
  if (!env.moonshotApiKey) {
    throw new Error('MOONSHOT_API_KEY not configured');
  }

  const response = await fetch(`${MOONSHOT_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.moonshotApiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(source) },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 8192,
    }),
  });

  const data = (await response.json()) as MoonshotResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Moonshot API error (${response.status})`);
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Moonshot returned empty content');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Moonshot returned invalid JSON');
  }

  return kimiScriptSchema.parse(parsed);
}
