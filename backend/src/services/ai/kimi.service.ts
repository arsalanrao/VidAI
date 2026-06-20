import { env } from '../../config/env.js';
import { kimiScriptSchema, type KimiScript, type YouTubeSource } from '../../types/script.types.js';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const KIMI_MODEL = 'moonshotai/kimi-k2.6';

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
- imagePrompt and thumbnailPrompt must be family-friendly (SFW): no violence, weapons, blood, gore, or fighting
- Do NOT use copyrighted character or franchise names (Marvel, Avengers, Disney, etc.) — describe generic visuals instead
- needs_lip_sync: true ONLY for direct talking-head / face-to-camera scenes
- Total scene durations should roughly match a 30-59 second Short
- Return JSON only, no markdown fences`;

function buildUserPrompt(source: YouTubeSource): string {
  const trimmedTranscript =
    source.transcript.length > 12_000
      ? `${source.transcript.slice(0, 12_000)}…`
      : source.transcript;

  const sparseSource = trimmedTranscript.startsWith('Create a viral YouTube Short inspired');

  if (sparseSource) {
    return `Create a brand-new viral YouTube Shorts package from this topic (no transcript was available):

SOURCE TITLE: ${source.title}

Return JSON only. Invent a compelling hook, narration, and scenes based on the title/topic.`;
  }

  return `Rewrite this viral YouTube Short into a fresh original Shorts package.

SOURCE TITLE: ${source.title}

SOURCE TRANSCRIPT:
${trimmedTranscript}

Return JSON only. Make it feel like a new viral Short — stronger hook, tighter pacing, original wording.`;
}

type KimiChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
  detail?: string;
};

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(jsonText);
}

function getErrorMessage(data: KimiChatResponse, status: number): string {
  return data.error?.message ?? data.detail ?? `NVIDIA API error (${status})`;
}

export async function checkKimiConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.nvidiaApiKey) {
    return { ok: false, message: 'NVIDIA_API_KEY not set on server' };
  }

  const response = await fetch(NVIDIA_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${env.nvidiaApiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 8,
      temperature: 0.2,
      top_p: 1,
      stream: false,
    }),
  });

  if (response.ok) {
    return { ok: true, message: 'connected via NVIDIA Build' };
  }

  const data = (await response.json().catch(() => ({}))) as KimiChatResponse;

  return {
    ok: false,
    message: getErrorMessage(data, response.status),
  };
}

export async function generateKimiScript(source: YouTubeSource): Promise<KimiScript> {
  if (!env.nvidiaApiKey) {
    throw new Error('NVIDIA_API_KEY not configured (required for Kimi K2.6 on NVIDIA Build)');
  }

  const response = await fetch(NVIDIA_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${env.nvidiaApiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(source) },
      ],
      max_tokens: 16384,
      temperature: 1,
      top_p: 1,
      stream: false,
    }),
  });

  const data = (await response.json()) as KimiChatResponse;

  if (!response.ok) {
    throw new Error(
      `Kimi K2.6 (NVIDIA Build): ${getErrorMessage(data, response.status)}. Check NVIDIA_API_KEY on Render.`,
    );
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Kimi returned empty content');
  }

  let parsed: unknown;

  try {
    parsed = parseJsonContent(content);
  } catch {
    throw new Error('Kimi returned invalid JSON');
  }

  return kimiScriptSchema.parse(parsed);
}

// Backwards-compatible alias for older imports
export const checkMoonshotConnection = checkKimiConnection;
