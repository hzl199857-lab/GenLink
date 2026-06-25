import { randomUUID } from 'node:crypto';

import { after, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
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

const STORYBOARD_JOB_RETENTION_MS = 60 * 60_000;

interface StoryboardRequestBody {
  prompt?: unknown;
  model?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  referenceImages?: unknown;
  referenceVideos?: unknown;
}

type TextStoryboardProvider = Exclude<ImageApiProvider, 'runninghub'>;
type StoryboardJobStatus = 'pending' | 'completed' | 'error';
type StoryboardJobResult = {
  ok: true;
  data: ReturnType<typeof normalizeStoryboardResponse> extends infer Result
    ? Result extends { ok: true; data: infer Data }
      ? Data
      : never
    : never;
  rawJson: string;
  model?: string;
};

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

function parseReferenceVideos(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((video): video is { label: string; url: string } => {
    return (
      typeof video === 'object' &&
      video !== null &&
      'label' in video &&
      typeof video.label === 'string' &&
      video.label.trim() !== '' &&
      'url' in video &&
      typeof video.url === 'string' &&
      video.url.trim() !== ''
    );
  }).map((video) => ({
    label: video.label.trim(),
    url: video.url.trim(),
  }));
}

async function cleanupExpiredJobs() {
  await prisma.imageJob.deleteMany({
    where: {
      id: {
        startsWith: 'storyboard-',
      },
      createdAt: {
        lt: new Date(Date.now() - STORYBOARD_JOB_RETENTION_MS),
      },
    },
  });
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

function parseStoryboardJobResult(result: string | null): StoryboardJobResult | undefined {
  if (!result) {
    return undefined;
  }

  try {
    return JSON.parse(result) as StoryboardJobResult;
  } catch {
    return undefined;
  }
}

async function runStoryboardJob(
  jobId: string,
  params: {
    prompt: string;
    model?: string;
    provider?: TextStoryboardProvider;
    apiKey?: string;
    referenceImages: Array<{ label: string; url: string }>;
    referenceVideos: Array<{ label: string; url: string }>;
  },
) {
  try {
    const storyboardPrompt = buildStoryboardGenerationPrompt({
      prompt: params.prompt,
      referenceImages: params.referenceImages,
      referenceVideos: params.referenceVideos,
    });
    const stream = await generateTextStream({
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
      videos: params.referenceVideos.map((video) => ({
        url: video.url,
      })),
    });
    const content = await readStoryboardTextStream(stream);
    const normalized = normalizeStoryboardResponse(content);

    if (!normalized.ok) {
      await prisma.imageJob.updateMany({
        where: { id: jobId, result: null },
        data: {
          status: 'error',
          error: normalized.error,
        },
      });
      return;
    }

    const result: StoryboardJobResult = {
      ok: true,
      data: normalized.data,
      rawJson: normalized.rawJson,
      model: params.model,
    };

    await prisma.imageJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        result: JSON.stringify(result),
        error: null,
      },
    });
  } catch (error) {
    const message = error instanceof VibeApiError
      ? getStoryboardGenerationErrorMessage({
          message: error.message,
          status: error.status,
          provider: params.provider,
          model: params.model,
        })
      : error instanceof Error
        ? error.message
        : 'Internal error';

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: 'error',
        error: message,
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    await cleanupExpiredJobs();

    const body = (await request.json()) as StoryboardRequestBody;

    if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      return NextResponse.json(
        { ok: false, error: 'Prompt is required' },
        { status: 400 },
      );
    }

    const referenceImages = parseReferenceImages(body.referenceImages);
    const referenceVideos = parseReferenceVideos(body.referenceVideos);
    const provider = parseProvider(body.provider);
    const model = typeof body.model === 'string' ? body.model : undefined;
    const jobId = `storyboard-${randomUUID()}`;

    await prisma.imageJob.create({
      data: {
        id: jobId,
        status: 'pending',
        provider: provider ?? null,
        historyNodeData: model ? JSON.stringify({ model }) : null,
      },
    });

    after(async () => {
      await runStoryboardJob(jobId, {
        prompt: body.prompt as string,
        model,
        provider,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
        referenceImages,
        referenceVideos,
      });
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: 'pending' satisfies StoryboardJobStatus,
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

export async function GET(request: Request) {
  await cleanupExpiredJobs();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId')?.trim();

  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: 'jobId is required' },
      { status: 400 },
    );
  }

  const job = await prisma.imageJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json(
      { ok: false, error: 'Storyboard job not found' },
      { status: 404 },
    );
  }

  const result = parseStoryboardJobResult(job.result);

  if (result) {
    return NextResponse.json({
      ok: true,
      jobId,
      status: 'completed' satisfies StoryboardJobStatus,
      result,
    });
  }

  if (job.status === 'error') {
    return NextResponse.json({
      ok: true,
      jobId,
      status: 'error' satisfies StoryboardJobStatus,
      error: job.error || 'Storyboard generation failed',
    });
  }

  const jobAgeMs = Date.now() - new Date(job.createdAt).getTime();

  if (jobAgeMs > getStoryboardGenerationTimeoutMs(parseProvider(job.provider))) {
    const error = 'Storyboard generation timed out';

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: 'error',
        error,
      },
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: 'error' satisfies StoryboardJobStatus,
      error,
    });
  }

  return NextResponse.json({
    ok: true,
    jobId,
    status: 'pending' satisfies StoryboardJobStatus,
  });
}
