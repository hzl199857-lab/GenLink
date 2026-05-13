import { NextResponse } from "next/server";

import { getImageHistoryDisplayPrompt } from "@/lib/image-prompt";
import { prisma } from "@/lib/prisma";
import type {
  ImageGenerationNodeData,
  ImageHistoryItem,
  ImageHistoryListItem,
} from "@/types/canvas";

export const runtime = "nodejs";

type ImageHistoryResponse =
  | { ok: true; items: ImageHistoryListItem[] }
  | { ok: true; item: ImageHistoryItem }
  | { ok: false; error: string };

function parseLimit(value: string | null): number {
  if (!value) {
    return 100;
  }

  const limit = Number.parseInt(value, 10);

  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.min(200, Math.max(1, limit));
}

function parseNodeData(value: string): ImageGenerationNodeData | null {
  try {
    return JSON.parse(value) as ImageGenerationNodeData;
  } catch {
    return null;
  }
}

function isDataUrl(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("data:"));
}

function toSafeImageUrl(imageUrl: string, hostedImageUrl: string | null): string {
  return hostedImageUrl?.trim() || (isDataUrl(imageUrl) ? "" : imageUrl);
}

function stripEmbeddedImageData(nodeData: ImageGenerationNodeData): ImageGenerationNodeData {
  const next: ImageGenerationNodeData = { ...nodeData };
  const displayPrompt = getImageHistoryDisplayPrompt(next);

  if (displayPrompt) {
    next.prompt = displayPrompt;
  }

  next.effectivePromptOverride = undefined;

  if (next.generatedHostedImageUrl?.trim() && isDataUrl(next.generatedImageUrl)) {
    next.generatedImageUrl = next.generatedHostedImageUrl;
  }

  if (next.referenceImages?.length) {
    next.referenceImages = next.referenceImages.map((image) => {
      if (image.hostedImageUrl?.trim() && isDataUrl(image.imageUrl)) {
        return {
          ...image,
          imageUrl: image.hostedImageUrl,
        };
      }

      return image;
    });
  }

  if (next.generationResults?.length) {
    next.generationResults = next.generationResults.map((result) => {
      if (result.hostedImageUrl?.trim() && isDataUrl(result.imageUrl)) {
        return {
          ...result,
          imageUrl: result.hostedImageUrl,
        };
      }

      return result;
    });
  }

  return next;
}

export async function GET(request: Request): Promise<NextResponse<ImageHistoryResponse>> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (id) {
    const row = await prisma.imageHistoryItem.findUnique({
      where: { id },
    });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "History item not found" },
        { status: 404 },
      );
    }

    const parsedNodeData = parseNodeData(row.nodeData);

    if (!parsedNodeData) {
      return NextResponse.json(
        { ok: false, error: "History item data is invalid" },
        { status: 500 },
      );
    }

    const imageUrl = toSafeImageUrl(row.imageUrl, row.hostedImageUrl);

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "History item image is unavailable" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: row.id,
        imageUrl,
        hostedImageUrl: row.hostedImageUrl ?? undefined,
        model: row.model ?? undefined,
        width: row.width ?? undefined,
        height: row.height ?? undefined,
        format: row.format ?? undefined,
        sizeBytes: row.sizeBytes ?? undefined,
        generatedAt: row.generatedAt.toISOString(),
        nodeData: stripEmbeddedImageData(parsedNodeData),
      },
    });
  }

  const limit = parseLimit(searchParams.get("limit"));

  const rows = await prisma.imageHistoryItem.findMany({
    orderBy: { generatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      hostedImageUrl: true,
      model: true,
      width: true,
      height: true,
      format: true,
      sizeBytes: true,
      generatedAt: true,
    },
  });

  const items = rows.flatMap((row): ImageHistoryListItem[] => {
    const imageUrl = row.hostedImageUrl?.trim();

    if (!imageUrl) {
      return [];
    }

    return [{
      id: row.id,
      imageUrl,
      hostedImageUrl: row.hostedImageUrl ?? undefined,
      model: row.model ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      format: row.format ?? undefined,
      sizeBytes: row.sizeBytes ?? undefined,
      generatedAt: row.generatedAt.toISOString(),
    }];
  });

  return NextResponse.json({
    ok: true,
    items,
  });
}
