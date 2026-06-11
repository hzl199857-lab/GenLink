import { NextResponse } from "next/server";

import { proxyOpenClawRequest } from "@/lib/openclaw/backend-proxy";
import {
  buildOpenClawEcomConfirmMessage,
  parseOpenClawEcomCreativeDoc,
} from "@/lib/openclaw/ecom-protocol";
import { mapAgentPanelModelToOpenClaw } from "@/lib/openclaw/model-mapping";
import {
  confirmPlanfEcomSession,
  type OpenClawPlanfEcomSession,
} from "@/lib/openclaw/planf-ecom-session";
import {
  RealOpenClawRuntimeError,
  runRealOpenClaw,
} from "@/lib/openclaw/real-runtime";
import { shouldUseRealOpenClawRuntime } from "@/lib/openclaw/start-policy";

export const runtime = "nodejs";

const ECOM_CONFIRM_TIMEOUT_MS = 5 * 60_000;

type ConfirmRequestBody = {
  session?: unknown;
  values?: unknown;
  projectId?: unknown;
  canvasId?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

function parseSession(value: unknown): OpenClawPlanfEcomSession | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Partial<OpenClawPlanfEcomSession>;

  return record.route === "ecomImageTrack" &&
    record.phase === "collecting" &&
    typeof record.request === "string" &&
    typeof record.preset === "string"
    ? record as OpenClawPlanfEcomSession
    : undefined;
}

function parseValues(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const productName = typeof record.productName === "string"
    ? record.productName.trim()
    : "";

  if (!productName) {
    return undefined;
  }

  return {
    productName,
    category: typeof record.category === "string" ? record.category : undefined,
    platform: typeof record.platform === "string" ? record.platform : undefined,
    sellingPointsText:
      typeof record.sellingPointsText === "string"
        ? record.sellingPointsText
        : undefined,
    imageSet: typeof record.imageSet === "string" ? record.imageSet : undefined,
    styleMode: typeof record.styleMode === "string" ? record.styleMode : undefined,
    styleLayer:
      typeof record.styleLayer === "string" ? record.styleLayer : undefined,
    sellingPoints: Array.isArray(record.sellingPoints)
      ? record.sellingPoints.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const proxied = await proxyOpenClawRequest(request);

    if (proxied) {
      return proxied;
    }

    const body = (await request.json()) as ConfirmRequestBody;
    const session = parseSession(body.session);
    const values = parseValues(body.values);
    if (!session || !values) {
      return NextResponse.json(
        { ok: false, error: "session and values are required" },
        { status: 400 },
      );
    }

    if (!shouldUseRealOpenClawRuntime()) {
      return NextResponse.json(
        { ok: false, error: "OPENCLAW_REAL_RUNTIME=0 disables the real OpenClaw runtime." },
        { status: 502 },
      );
    }

    const provider = typeof body.provider === "string" ? body.provider : undefined;
    const openClawProvider = provider === "vibe" ||
      provider === "fucheers" ||
      provider === "comfly" ||
      provider === "zhenzhen" ||
      provider === "grsai"
      ? provider
      : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const response = await (async () => {
      try {
        const real = await runRealOpenClaw({
          message: buildOpenClawEcomConfirmMessage({ session, values }),
          sessionKey: `genlink-planf-confirm-${session.sessionId}`,
          timeoutMs: ECOM_CONFIRM_TIMEOUT_MS,
          provider: openClawProvider,
          model: mapAgentPanelModelToOpenClaw({ provider: openClawProvider, model }),
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        });

        return parseOpenClawEcomCreativeDoc(real.text, values);
      } catch (error) {
        if (error instanceof RealOpenClawRuntimeError) {
          throw error;
        }

        console.warn("[openclaw/planf/ecom/confirm] using local creative-doc fallback", error);

        return confirmPlanfEcomSession({ session, values });
      }
    })();

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof RealOpenClawRuntimeError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid OpenClaw ecom confirm request" },
      { status: 400 },
    );
  }
}
