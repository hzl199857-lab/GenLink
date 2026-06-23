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
type StoryboardStreamPayload = Record<string, unknown>;

const STORYBOARD_STREAM_HEARTBEAT_MS = 10_000;

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

function encodeStoryboardStreamEvent(payload: StoryboardStreamPayload): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function createStoryboardStreamResponse(params: {
  prompt: string;
  model?: string;
  provider?: TextStoryboardProvider;
  apiKey?: string;
  referenceImages: Array<{ label: string; url: string }>;
}) {
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      const enqueue = (payload: StoryboardStreamPayload) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encodeStoryboardStreamEvent(payload));
      };
      const close = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;
        clearInterval(heartbeatId);
        controller.close();
      };
      const fail = (error: unknown) => {
        if (error instanceof VibeApiError) {
          enqueue({
            type: 'error',
            error: getStoryboardGenerationErrorMessage({
              message: error.message,
              status: error.status,
              provider: params.provider,
              model: params.model,
            }),
          });
          close();
          return;
        }

        enqueue({
          type: 'error',
          error: error instanceof Error ? error.message : 'Internal error',
        });
        close();
      };
      const heartbeatId = setInterval(() => {
        enqueue({ type: 'heartbeat' });
      }, STORYBOARD_STREAM_HEARTBEAT_MS);
      cleanup = () => {
        isClosed = true;
        clearInterval(heartbeatId);
      };

      enqueue({ type: 'heartbeat' });

      void (async () => {
        try {
          const storyboardPrompt = buildStoryboardGenerationPrompt({
            prompt: params.prompt,
            referenceImages: params.referenceImages,
          });
          const textStream = await generateTextStream({
            prompt: storyboardPrompt.userPrompt,
            model: params.model,
            systemPrompt: storyboardPrompt.systemPrompt,
            temperature: 0.4,
            provider: params.provider,
            apiKey: params.apiKey,
            timeoutMs: getStoryboardGenerationTimeoutMs(params.provider),
            images: params.referenceImages.map((image) => ({
              url: image.url,
            })),
          });
          const content = await readStoryboardTextStream(textStream);
          const normalized = normalizeStoryboardResponse(content);

          if (!normalized.ok) {
            enqueue({
              type: 'error',
              error: normalized.error,
            });
            close();
            return;
          }

          enqueue({
            type: 'done',
            result: {
              ok: true,
              data: normalized.data,
              rawJson: normalized.rawJson,
              model: params.model,
            },
          });
          close();
        } catch (error) {
          fail(error);
        }
      })();
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StoryboardRequestBody;

    if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      return NextResponse.json(
        { ok: false, error: 'Prompt is required' },
        { status: 400 },
      );
    }

    const referenceImages = parseReferenceImages(body.referenceImages);
    const requestProvider = parseProvider(body.provider);
    const requestModel = typeof body.model === 'string' ? body.model : undefined;

    return createStoryboardStreamResponse({
      prompt: body.prompt,
      model: requestModel,
      provider: requestProvider,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      referenceImages,
    });
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
