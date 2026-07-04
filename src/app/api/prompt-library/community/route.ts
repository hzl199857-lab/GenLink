import { NextResponse } from "next/server";

import bundledCommunityPrompts from "@/features/prompt-library/bundledCommunityPrompts.json";
import type {
  PromptLibraryApiResponse,
  PromptLibraryCommunityResponse,
  PromptLibraryEntry,
} from "@/features/prompt-library/types";
import { fetchPromptLibraryCommunityEntries } from "@/lib/prompt-library/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUNDLED_COMMUNITY_PROMPTS = bundledCommunityPrompts as PromptLibraryEntry[];

export async function GET(request: Request): Promise<NextResponse<PromptLibraryApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("force") === "1";
    const { entries, errors, fetchedAt, fromCache } = await fetchPromptLibraryCommunityEntries({
      forceRefresh,
    });
    const responseEntries = entries.length > 0 ? entries : BUNDLED_COMMUNITY_PROMPTS;
    const body: PromptLibraryCommunityResponse = {
      ok: true,
      entries: responseEntries,
      errors,
      fetchedAt,
      fromCache,
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "提示词库同步失败",
      },
      { status: 502 },
    );
  }
}
