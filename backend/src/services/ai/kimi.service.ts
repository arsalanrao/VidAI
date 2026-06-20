import { env } from '../../config/env.js';
import { kimiScriptSchema, type KimiScript, type YouTubeSource } from '../../types/script.types.js';
import type { ProjectPreferences } from '../../types/project-preferences.types.js';
import { visualThemeLabel } from '../../types/project-preferences.types.js';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const KIMI_MODEL = 'moonshotai/kimi-k2.6';

const SYSTEM_PROMPT = `You are a JSON API for viral YouTube Shorts scripts.
You MUST respond with a single raw JSON object only.
No markdown. No code fences. No explanations. No thinking. No preamble. No commentary.

Output schema:
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
      "imagePrompts": ["string — 3 variants: wide, medium, close-up for the same scene"],
      "motionPreset": "cinematic | horror | space | history | mystery | epic | fantasy | cyberpunk",
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
- Return ONLY the JSON object`;

function buildUserPrompt(source: YouTubeSource, preferences?: ProjectPreferences): string {
  const trimmedTranscript =
    source.transcript.length > 12_000
      ? `${source.transcript.slice(0, 12_000)}…`
      : source.transcript;

  const sparseSource = trimmedTranscript.startsWith('Create a viral YouTube Short inspired');
  const themeLine = preferences
    ? `\nVISUAL THEME: ${visualThemeLabel(preferences.visualTheme)} — match tone, color palette, and scene imagery to this theme.`
    : '';

  if (sparseSource) {
    return `Create a brand-new viral YouTube Shorts package from this topic (no transcript was available):

SOURCE TITLE: ${source.title}${themeLine}

Return ONLY the JSON object. Invent a compelling hook, narration, and scenes based on the title/topic.`;
  }

  return `Rewrite this viral YouTube Short into a fresh original Shorts package.

SOURCE TITLE: ${source.title}${themeLine}

SOURCE TRANSCRIPT:
${trimmedTranscript}

Return ONLY the JSON object. Make it feel like a new viral Short — stronger hook, tighter pacing, original wording.`;
}

type KimiMessage = {
  content?: string | Array<{ type?: string; text?: string }> | null;
  reasoning_content?: string | null;
};

type KimiChatResponse = {
  choices?: Array<{ message?: KimiMessage }>;
  error?: { message?: string };
  detail?: string;
};

type KimiChatRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  top_p: number;
  stream: false;
  chat_template_kwargs: { thinking: false };
};

function extractMessageText(message: KimiMessage | undefined): string {
  if (!message) {
    return '';
  }

  const { content, reasoning_content } = message;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text!)
      .join('\n');
  }

  return reasoning_content ?? '';
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1')
    .trim();
}

function extractJsonObject(text: string): string | null {
  const cleaned = stripThinkingBlocks(text);
  const start = cleaned.indexOf('{');

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return cleaned.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectText = extractJsonObject(trimmed);

  if (objectText) {
    return JSON.parse(objectText);
  }

  return JSON.parse(trimmed);
}

function getErrorMessage(data: KimiChatResponse, status: number): string {
  return data.error?.message ?? data.detail ?? `NVIDIA API error (${status})`;
}

function buildKimiPayload(
  messages: Array<{ role: string; content: string }>,
): KimiChatRequest {
  return {
    model: KIMI_MODEL,
    messages,
    max_tokens: 16384,
    temperature: 0.3,
    top_p: 1,
    stream: false,
    chat_template_kwargs: { thinking: false },
  };
}

async function invokeKimi(messages: Array<{ role: string; content: string }>): Promise<string> {
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
    body: JSON.stringify(buildKimiPayload(messages)),
  });

  const data = (await response.json()) as KimiChatResponse;

  if (!response.ok) {
    throw new Error(
      `Kimi K2.6 (NVIDIA Build): ${getErrorMessage(data, response.status)}. Check NVIDIA_API_KEY on Render.`,
    );
  }

  const content = extractMessageText(data.choices?.[0]?.message);

  if (!content.trim()) {
    throw new Error('Kimi returned empty content');
  }

  return content;
}

function parseKimiScriptContent(content: string): KimiScript {
  let parsed: unknown;

  try {
    parsed = parseJsonContent(content);
  } catch (err) {
    const snippet = content.trim().slice(0, 240).replace(/\s+/g, ' ');
    const detail = err instanceof Error ? err.message : 'parse error';
    throw new Error(`Kimi returned invalid JSON (${detail}): ${snippet}`);
  }

  return kimiScriptSchema.parse(parsed);
}

export async function checkKimiConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.nvidiaApiKey) {
    return { ok: false, message: 'NVIDIA_API_KEY not set on server' };
  }

  try {
    const content = await invokeKimi([{ role: 'user', content: 'Reply with exactly: OK' }]);
    return content.includes('OK')
      ? { ok: true, message: 'connected via NVIDIA Build' }
      : { ok: true, message: `connected via NVIDIA Build (reply: ${content.slice(0, 40)})` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Kimi check failed',
    };
  }
}

export async function generateKimiScript(
  source: YouTubeSource,
  preferences?: ProjectPreferences,
): Promise<KimiScript> {
  const userPrompt = buildUserPrompt(source, preferences);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let content = await invokeKimi(messages);

  try {
    return parseKimiScriptContent(content);
  } catch (firstError) {
    console.warn('[kimi] first response was not valid JSON, retrying with repair prompt');

    content = await invokeKimi([
      ...messages,
      {
        role: 'assistant',
        content: content.slice(0, 4000),
      },
      {
        role: 'user',
        content:
          'Your previous answer was not valid JSON. Return ONLY one raw JSON object matching the schema. No markdown, no explanation, no thinking.',
      },
    ]);

    return parseKimiScriptContent(content);
  }
}

// Backwards-compatible alias for older imports
export const checkMoonshotConnection = checkKimiConnection;
