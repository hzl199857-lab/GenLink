import {
  STORYBOARD_SCRIPT_IMAGE_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_IMAGE_USER_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_MULTIMODAL_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_TEXT_ONLY_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_TEXT_ONLY_USER_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_VIDEO_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_VIDEO_USER_PROMPT_TEMPLATE,
} from './original-prompts';

export interface StoryboardPromptReferenceImage {
  label: string;
  url: string;
}

export interface BuildStoryboardPromptParams {
  prompt: string;
  referenceImages?: StoryboardPromptReferenceImage[];
}

export type StoryboardPromptMode = 'TEXT_ONLY' | 'IMAGE' | 'VIDEO' | 'MULTIMODAL';

interface BuiltInStoryboardPrompt {
  mode: StoryboardPromptMode;
  sourceMode: 'text' | 'image' | 'video' | 'multimodal';
  systemPrompt: string;
  userPromptTemplate: string;
}

export interface StoryboardGenerationPrompt {
  mode: StoryboardPromptMode;
  sourceMode: BuiltInStoryboardPrompt['sourceMode'];
  systemPrompt: string;
  userPrompt: string;
}

export const STORYBOARD_BUILT_IN_PROMPTS: Record<StoryboardPromptMode, BuiltInStoryboardPrompt> = {
  TEXT_ONLY: {
    mode: 'TEXT_ONLY',
    sourceMode: 'text',
    systemPrompt: STORYBOARD_SCRIPT_TEXT_ONLY_SYSTEM_PROMPT,
    userPromptTemplate: STORYBOARD_SCRIPT_TEXT_ONLY_USER_PROMPT_TEMPLATE,
  },
  IMAGE: {
    mode: 'IMAGE',
    sourceMode: 'image',
    systemPrompt: STORYBOARD_SCRIPT_IMAGE_SYSTEM_PROMPT,
    userPromptTemplate: STORYBOARD_SCRIPT_IMAGE_USER_PROMPT_TEMPLATE,
  },
  VIDEO: {
    mode: 'VIDEO',
    sourceMode: 'video',
    systemPrompt: STORYBOARD_SCRIPT_VIDEO_SYSTEM_PROMPT,
    userPromptTemplate: STORYBOARD_SCRIPT_VIDEO_USER_PROMPT_TEMPLATE,
  },
  MULTIMODAL: {
    mode: 'MULTIMODAL',
    sourceMode: 'multimodal',
    systemPrompt: STORYBOARD_SCRIPT_MULTIMODAL_PROMPT_TEMPLATE,
    userPromptTemplate: STORYBOARD_SCRIPT_MULTIMODAL_PROMPT_TEMPLATE,
  },
};

function replaceTemplateValue(template: string, key: string, value: string): string {
  return template.replace(
    new RegExp(`\\{\\{?\\s*${key}(?:\\s*\\|\\|?\\s*([^}]+))?\\s*\\}\\}?`, 'g'),
    (_match, fallback: string | undefined) => value || fallback || '',
  );
}

function getReferenceImageLabels(referenceImages: StoryboardPromptReferenceImage[]): string {
  const labels = referenceImages
    .map((image) => image.label.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.join('、') : '@图片1';
}

export function getStoryboardPromptMode({ referenceImages = [] }: Pick<BuildStoryboardPromptParams, 'referenceImages'>): StoryboardPromptMode {
  return referenceImages.length > 0 ? 'IMAGE' : 'TEXT_ONLY';
}

export function buildStoryboardGenerationPrompt({
  prompt,
  referenceImages = [],
}: BuildStoryboardPromptParams): StoryboardGenerationPrompt {
  const mode = getStoryboardPromptMode({ referenceImages });
  const builtInPrompt = STORYBOARD_BUILT_IN_PROMPTS[mode];
  let userPrompt = replaceTemplateValue(
    builtInPrompt.userPromptTemplate,
    '用户输入',
    prompt.trim(),
  );

  if (mode === 'IMAGE') {
    userPrompt = replaceTemplateValue(
      userPrompt,
      '参考图片',
      getReferenceImageLabels(referenceImages),
    );
  }

  return {
    mode,
    sourceMode: builtInPrompt.sourceMode,
    systemPrompt: builtInPrompt.systemPrompt,
    userPrompt,
  };
}

export const STORYBOARD_SYSTEM_PROMPT = STORYBOARD_BUILT_IN_PROMPTS.TEXT_ONLY.systemPrompt;

export function buildStoryboardUserPrompt(params: BuildStoryboardPromptParams): string {
  return buildStoryboardGenerationPrompt(params).userPrompt;
}
