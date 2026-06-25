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

export interface StoryboardPromptReferenceVideo {
  label: string;
  url: string;
}

export interface BuildStoryboardPromptParams {
  prompt: string;
  referenceImages?: StoryboardPromptReferenceImage[];
  referenceVideos?: StoryboardPromptReferenceVideo[];
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

function getReferenceVideoLabels(referenceVideos: StoryboardPromptReferenceVideo[]): string {
  const labels = referenceVideos
    .map((video) => video.label.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.join('、') : '@视频1';
}

function appendReferenceContext({
  userPrompt,
  referenceImages,
  referenceVideos,
}: {
  userPrompt: string;
  referenceImages: StoryboardPromptReferenceImage[];
  referenceVideos: StoryboardPromptReferenceVideo[];
}): string {
  const sections: string[] = [];

  if (referenceImages.length > 0) {
    sections.push(`参考图片：${getReferenceImageLabels(referenceImages)}`);
  }

  if (referenceVideos.length > 0) {
    sections.push(
      [
        `参考视频：${getReferenceVideoLabels(referenceVideos)}`,
        '本次没有本地视频切片帧；请直接理解参考视频的完整时间线。rows[].参考 可以填写对应的 @视频N，必要时附带时间段，例如 @视频1 00:01.2-00:03.0。',
      ].join('\n'),
    );
  }

  return sections.length > 0
    ? [userPrompt, sections.join('\n\n')].join('\n\n')
    : userPrompt;
}

export function getStoryboardPromptMode({
  referenceImages = [],
  referenceVideos = [],
}: Pick<BuildStoryboardPromptParams, 'referenceImages' | 'referenceVideos'>): StoryboardPromptMode {
  if (referenceVideos.length > 0 && referenceImages.length > 0) {
    return 'MULTIMODAL';
  }

  if (referenceVideos.length > 0) {
    return 'VIDEO';
  }

  return referenceImages.length > 0 ? 'IMAGE' : 'TEXT_ONLY';
}

export function buildStoryboardGenerationPrompt({
  prompt,
  referenceImages = [],
  referenceVideos = [],
}: BuildStoryboardPromptParams): StoryboardGenerationPrompt {
  const mode = getStoryboardPromptMode({ referenceImages, referenceVideos });
  const builtInPrompt = STORYBOARD_BUILT_IN_PROMPTS[mode];
  let userPrompt = replaceTemplateValue(
    builtInPrompt.userPromptTemplate,
    '用户输入',
    prompt.trim(),
  );

  if (mode === 'IMAGE' || mode === 'MULTIMODAL') {
    userPrompt = replaceTemplateValue(
      userPrompt,
      '参考图片',
      getReferenceImageLabels(referenceImages),
    );
  }

  if (mode === 'VIDEO' || mode === 'MULTIMODAL') {
    userPrompt = replaceTemplateValue(
      userPrompt,
      '视频切片参考',
      '',
    );
    userPrompt = replaceTemplateValue(
      userPrompt,
      '参考视频',
      getReferenceVideoLabels(referenceVideos),
    );
  }

  if (mode === 'VIDEO' || mode === 'MULTIMODAL') {
    userPrompt = appendReferenceContext({
      userPrompt,
      referenceImages,
      referenceVideos,
    });
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
