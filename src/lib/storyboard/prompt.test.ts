import {
  STORYBOARD_BUILT_IN_PROMPTS,
  buildStoryboardGenerationPrompt,
  getStoryboardPromptMode,
} from './prompt';
import {
  STORYBOARD_SCRIPT_IMAGE_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_IMAGE_USER_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_MULTIMODAL_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_TEXT_ONLY_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_TEXT_ONLY_USER_PROMPT_TEMPLATE,
  STORYBOARD_SCRIPT_VIDEO_SYSTEM_PROMPT,
  STORYBOARD_SCRIPT_VIDEO_USER_PROMPT_TEMPLATE,
} from './original-prompts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function runStoryboardPromptTests(): void {
  assertEqual(
    Object.keys(STORYBOARD_BUILT_IN_PROMPTS).length,
    4,
    'built-in prompt mode count',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.TEXT_ONLY.systemPrompt,
    STORYBOARD_SCRIPT_TEXT_ONLY_SYSTEM_PROMPT,
    'text-only system prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.TEXT_ONLY.userPromptTemplate,
    STORYBOARD_SCRIPT_TEXT_ONLY_USER_PROMPT_TEMPLATE,
    'text-only user prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.IMAGE.systemPrompt,
    STORYBOARD_SCRIPT_IMAGE_SYSTEM_PROMPT,
    'image system prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.IMAGE.userPromptTemplate,
    STORYBOARD_SCRIPT_IMAGE_USER_PROMPT_TEMPLATE,
    'image user prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.VIDEO.systemPrompt,
    STORYBOARD_SCRIPT_VIDEO_SYSTEM_PROMPT,
    'video system prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.VIDEO.userPromptTemplate,
    STORYBOARD_SCRIPT_VIDEO_USER_PROMPT_TEMPLATE,
    'video user prompt matches original',
  );
  assertEqual(
    STORYBOARD_BUILT_IN_PROMPTS.MULTIMODAL.systemPrompt,
    STORYBOARD_SCRIPT_MULTIMODAL_PROMPT_TEMPLATE,
    'multimodal prompt matches original',
  );

  const textPrompt = buildStoryboardGenerationPrompt({
    prompt: '一个雨夜重逢的短剧，拆成 3 个镜头',
  });

  assertEqual(textPrompt.mode, 'TEXT_ONLY', 'text prompt mode');
  assert(textPrompt.systemPrompt.includes('sourceMode 必须是 "text"'), 'text system source mode');
  assert(textPrompt.userPrompt.includes('一个雨夜重逢的短剧'), 'text user prompt contains input');
  assert(!textPrompt.userPrompt.includes('@图片1'), 'text mode does not inject image placeholder');

  const imagePrompt = buildStoryboardGenerationPrompt({
    prompt: '根据参考图生成产品广告',
    referenceImages: [
      { label: '@图片1', url: 'https://example.com/one.png' },
      { label: '@图片2', url: 'https://example.com/two.png' },
    ],
  });

  assertEqual(getStoryboardPromptMode({ referenceImages: [] }), 'TEXT_ONLY', 'empty images use text mode');
  assertEqual(imagePrompt.mode, 'IMAGE', 'image prompt mode');
  assert(imagePrompt.systemPrompt.includes('sourceMode 必须是 "image"'), 'image system source mode');
  assert(imagePrompt.userPrompt.includes('@图片1、@图片2'), 'image user prompt lists references');
}
