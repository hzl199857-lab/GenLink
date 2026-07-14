import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-guard";
import {
  MidjourneyApiError,
  parseMidjourneyUpscaleRequest,
  submitMidjourneyUpscale,
} from "@/lib/comfly-midjourney";
import { prisma } from "@/lib/prisma";
import type { MidjourneyImageMetadata } from "@/types/canvas";

export const runtime = "nodejs";

type StoredImageJobResult = {
  model?: string;
  images?: Array<{
    imageUrl?: string;
    hostedImageUrl?: string;
  }>;
  midjourney?: MidjourneyImageMetadata;
};

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;

  try {
    const body = parseMidjourneyUpscaleRequest(await request.json());
    const { jobId, quadrant } = body;
    const originalJob = await prisma.imageJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        provider: true,
        result: true,
      },
    });

    if (!originalJob) {
      return NextResponse.json(
        { ok: false, error: "Midjourney 四宫格任务不存在" },
        { status: 404 },
      );
    }

    if (originalJob.provider !== "comfly-midjourney" || !originalJob.result) {
      return NextResponse.json(
        { ok: false, error: "该任务不是已完成的 Midjourney 四宫格" },
        { status: 409 },
      );
    }

    let storedResult: StoredImageJobResult;

    try {
      storedResult = JSON.parse(originalJob.result) as StoredImageJobResult;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Midjourney 四宫格任务数据损坏" },
        { status: 500 },
      );
    }

    const gridMetadata = storedResult.midjourney;

    if (gridMetadata?.kind !== "grid") {
      return NextResponse.json(
        { ok: false, error: "该四宫格不支持所选高清操作" },
        { status: 409 },
      );
    }

    const customId = gridMetadata.actions?.[quadrant];

    if (!gridMetadata.actions || !customId) {
      return NextResponse.json(
        { ok: false, error: "该四宫格不支持所选高清操作" },
        { status: 409 },
      );
    }

    if (!body.apiKey) {
      return NextResponse.json(
        { ok: false, error: "请先配置 Comfly API Key" },
        { status: 400 },
      );
    }

    const submission = await submitMidjourneyUpscale({
      taskId: gridMetadata.taskId,
      quadrant,
      actions: gridMetadata.actions,
      apiKey: body.apiKey,
    });
    const nextJobId = randomUUID();
    const gridImage = storedResult.images?.[0];
    const upscaleMetadata: MidjourneyImageMetadata = {
      kind: "upscale",
      jobId: nextJobId,
      taskId: submission.taskId,
      sourceTaskId: gridMetadata.taskId,
      selectedQuadrant: quadrant,
      gridImageUrl: gridImage?.imageUrl,
      gridHostedImageUrl: gridImage?.hostedImageUrl,
    };

    await prisma.imageJob.create({
      data: {
        id: nextJobId,
        status: "pending",
        provider: "comfly-midjourney",
        upstreamTaskId: submission.taskId,
        historyNodeData: JSON.stringify({
          provider: "comfly",
          model: "midjourney",
          midjourney: upscaleMetadata,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: nextJobId,
      status: "pending" as const,
    });
  } catch (error) {
    if (error instanceof MidjourneyApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, retryable: error.retryable },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Midjourney 高清任务提交失败" },
      { status: 500 },
    );
  }
}
