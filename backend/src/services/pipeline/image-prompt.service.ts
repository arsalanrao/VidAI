import { buildSaferPromptAlternatives } from '../ai/flux.service.js';
import { generateSaferImagePromptWithKimi } from '../ai/kimi.service.js';

export type SaferPromptResult = {
  blockedPrompt: string;
  suggestedPrompt: string;
  alternatives: string[];
  aiPrompt?: string;
};

export function buildSaferPromptSuggestions(blockedPrompt: string): SaferPromptResult {
  const { suggested, all } = buildSaferPromptAlternatives(blockedPrompt);

  return {
    blockedPrompt,
    suggestedPrompt: suggested,
    alternatives: all,
  };
}

export async function buildSaferPromptSuggestionsWithAi(
  blockedPrompt: string,
): Promise<SaferPromptResult> {
  const base = buildSaferPromptSuggestions(blockedPrompt);

  try {
    const aiPrompt = await generateSaferImagePromptWithKimi(blockedPrompt);
    return {
      ...base,
      aiPrompt,
      suggestedPrompt: aiPrompt,
      alternatives: [aiPrompt, ...base.alternatives.filter((item) => item !== aiPrompt)],
    };
  } catch (err) {
    console.warn('[image-prompt] Kimi softer prompt failed, using rule-based fallback:', err);
    return base;
  }
}

export type ImageBlockContext = {
  sceneId?: string;
  sceneOrder?: number;
  blockedPrompt: string;
  suggestedPrompt: string;
  promptAlternatives: string[];
  aiPrompt?: string;
};

export function imageBlockFromPrompt(blockedPrompt: string, aiPrompt?: string): ImageBlockContext {
  const base = buildSaferPromptSuggestions(blockedPrompt);
  const suggestedPrompt = aiPrompt ?? base.suggestedPrompt;
  const promptAlternatives = aiPrompt
    ? [aiPrompt, ...base.alternatives.filter((item) => item !== aiPrompt)]
    : base.alternatives;

  return {
    blockedPrompt,
    suggestedPrompt,
    promptAlternatives,
    aiPrompt,
  };
}
