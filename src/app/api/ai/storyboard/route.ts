import { NextResponse } from 'next/server';

import {
  VibeApiError,
  generateTextStream,
  type ImageApiProvider,
  type TextStreamChunk,
} from '@/lib/vibe';
import {
  buildStoryboardGenerationPrompt,
} from '@/lib/storyboard/prompt';
import { normalizeStoryboardResponse } from '@/lib/storyboard/normalize';
import {
  getStoryboardGenerationErrorMessage,
  getStoryboardGenerationTimeoutMs,
} from '@/lib/storyboard/error-message';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface StoryboardRequestBody {
  prompt?: unknown;
  model?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  referenceImages?: unknown;
}

type TextStoryboardProvider = Exclude<ImageApiProvider, 'runninghub'>;

function parseProvider(value: unknown): TextStoryboardProvider | undefined {
  if (
    value === 'vibe' ||
    value === 'fucheers' ||
    value === 'comfly' ||
    value === 'zhenzhen' ||
    value === 'grsai'
  ) {
    return value;
  }

  return undefined;
}

function parseReferenceImages(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((image): image is { label: string; url: string } => {
    return (
      typeof image === 'object' &&
      image !== null &&
      'label' in image &&
      typeof image.label === 'string' &&
      image.label.trim() !== '' &&
      'url' in image &&
      typeof image.url === 'string' &&
      image.url.trim() !== ''
    );
  }).map((image) => ({
    label: image.label.trim(),
    url: image.url.trim(),
  }));
}

async function readStoryboardTextStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separatorIndex = buffer.indexOf('\n\n');

        if (separatorIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length === 0) {
          continue;
        }

        const event = JSON.parse(dataLines.join('\n')) as TextStreamChunk;

        if (event.type === 'delta') {
          content += event.delta || '';
          continue;
        }

        if (event.type === 'error') {
          throw new VibeApiError(502, event.error || 'Storyboard stream failed');
        }

        if (event.type === 'done' && event.result?.content) {
          content = event.result.content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return content;
}

export async function POST(request: Request) {
  let requestProvider: TextStoryboardProvider | undefined;
  let requestModel: string | undefined;

  try {
    const body = (await request.json()) as StoryboardRequestBody;

    if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      return NextResponse.json(
        { ok: false, error: 'Prompt is required' },
        { status: 400 },
      );
    }

    const referenceImages = parseReferenceImages(body.referenceImages);
    requestProvider = parseProvider(body.provider);
    requestModel = typeof body.model === 'string' ? body.model : undefined;
    const storyboardPrompt = buildStoryboardGenerationPrompt({
      prompt: body.prompt,
      referenceImages,
    });
    const stream = await generateTextStream({
      prompt: storyboardPrompt.userPrompt,
      model: requestModel,
      systemPrompt: storyboardPrompt.systemPrompt,
      temperature: 0.4,
      provider: requestProvider,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      timeoutMs: getStoryboardGenerationTimeoutMs(requestProvider),
      images: referenceImages.map((image) => ({
        url: image.url,
      })),
    });
    const content = await readStoryboardTextStream(stream);
    const normalized = normalizeStoryboardResponse(content);

    if (!normalized.ok) {
      return NextResponse.json(
        normalized,
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: normalized.data,
      rawJson: normalized.rawJson,
      model: requestModel,
    });
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: getStoryboardGenerationErrorMessage({
            message: error.message,
            status: error.status,
            provider: requestProvider,
            model: requestModel,
          }),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
