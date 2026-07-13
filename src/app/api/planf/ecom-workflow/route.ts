import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import {
  createPlanfEcomWorkflowResponse,
  type PlanfEcomPackageMode,
  type PlanfEcomStyleMode,
} from "@/lib/planf-ecom";

export const runtime = "nodejs";

type PlanfEcomWorkflowRequestBody = {
  request?: unknown;
  styleMode?: unknown;
  packageMode?: unknown;
  product?: unknown;
  platform?: unknown;
  aspectRatio?: unknown;
  extraConstraints?: unknown;
  rulesRoot?: unknown;
};

function parseStyleMode(value: unknown): PlanfEcomStyleMode | undefined {
  return value === "default" ||
    value === "detail-page" ||
    value === "ugc" ||
    value === "stylist"
    ? value
    : undefined;
}

function parsePackageMode(value: unknown): PlanfEcomPackageMode | undefined {
  return value === "single" ||
    value === "full-set-8" ||
    value === "detail-page-pack" ||
    value === "amazon-adapter" ||
    value === "ugc-lifestyle" ||
    value === "editorial-stylist"
    ? value
    : undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as PlanfEcomWorkflowRequestBody;
    const userRequest = parseString(body.request);

    if (!userRequest) {
      return NextResponse.json(
        { ok: false, error: "request is required" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      createPlanfEcomWorkflowResponse({
        request: userRequest,
        styleMode: parseStyleMode(body.styleMode),
        packageMode: parsePackageMode(body.packageMode),
        product: parseString(body.product),
        platform: parseString(body.platform),
        aspectRatio: parseString(body.aspectRatio),
        extraConstraints: parseString(body.extraConstraints),
        rulesRoot: parseString(body.rulesRoot),
      }),
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid PlanF e-commerce workflow request" },
      { status: 400 },
    );
  }
}
