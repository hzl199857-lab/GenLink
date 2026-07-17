import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { isAgentTextProvider } from "@/lib/agent-provider-options";
import { proxyOpenClawRequest } from "@/lib/openclaw/backend-proxy";
import {
  buildOpenClawEcomConfirmMessage,
  parseOpenClawEcomCreativeDoc,
} from "@/lib/openclaw/ecom-protocol";
import {
  AgentModelCompatibilityError,
  mapAgentPanelModelToOpenClaw,
} from "@/lib/openclaw/model-mapping";
import {
  type OpenClawPlanfEcomSession,
} from "@/lib/openclaw/planf-ecom-session";
import {
  RealOpenClawRuntimeError,
  getPublicRealOpenClawRuntimeDiagnostic,
  runRealOpenClaw,
} from "@/lib/openclaw/real-runtime";
import {
  PlanfRulesContextError,
  buildPlanfEcomRulesMessage,
} from "@/lib/openclaw/rules-context";
import { shouldUseRealOpenClawRuntime } from "@/lib/openclaw/start-policy";

export const runtime = "nodejs";

const ECOM_CONFIRM_TIMEOUT_MS = 5 * 60_000;

class OpenClawEcomConfirmGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawEcomConfirmGenerationError";
  }
}

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
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
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
    const openClawProvider = isAgentTextProvider(provider) ? provider : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const mappedModel = mapAgentPanelModelToOpenClaw({ provider: openClawProvider, model });
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const real = await runRealOpenClaw({
      message: await buildPlanfEcomRulesMessage({
        stage: "confirm",
        preset: session.preset,
        imageSet: values.imageSet,
        styleMode: values.styleMode,
        taskMessage: buildOpenClawEcomConfirmMessage({ session, values }),
      }),
      sessionKey: `genlink-planf-confirm-${session.sessionId}`,
      timeoutMs: ECOM_CONFIRM_TIMEOUT_MS,
      provider: openClawProvider,
      model: mappedModel,
      apiKey,
    });
    let response: ReturnType<typeof parseOpenClawEcomCreativeDoc>;

    try {
      response = parseOpenClawEcomCreativeDoc(real.text, values, session);
    } catch (firstError) {
      const firstMessage = firstError instanceof Error ? firstError.message : "creative-doc validation failed";
      const repaired = await runRealOpenClaw({
        message: await buildPlanfEcomRulesMessage({
          stage: "confirm",
          preset: session.preset,
          imageSet: values.imageSet,
          styleMode: values.styleMode,
          taskMessage: buildOpenClawEcomConfirmMessage({
            session,
            values,
            previousText: real.text,
            previousValidationError: firstMessage,
          }),
        }),
        sessionKey: `genlink-planf-confirm-repair-${session.sessionId}`,
        timeoutMs: ECOM_CONFIRM_TIMEOUT_MS,
        provider: openClawProvider,
        model: mappedModel,
        apiKey,
      });

      try {
        response = parseOpenClawEcomCreativeDoc(repaired.text, values, session);
      } catch (repairError) {
        const repairMessage = repairError instanceof Error ? repairError.message : "creative-doc repair validation failed";

        console.warn("[openclaw/planf/ecom/confirm] agent creative-doc validation failed", {
          firstMessage,
          repairMessage,
        });

        throw new OpenClawEcomConfirmGenerationError(
          `所选 Agent 连续两次返回的电商编排方案都未通过规则校验（${repairMessage}），请重试。`,
        );
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AgentModelCompatibilityError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    if (error instanceof RealOpenClawRuntimeError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.publicMessage ?? error.message,
          diagnostic: getPublicRealOpenClawRuntimeDiagnostic(error.diagnostic),
        },
        { status: 504 },
      );
    }

    if (error instanceof PlanfRulesContextError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 502 },
      );
    }

    if (error instanceof OpenClawEcomConfirmGenerationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid OpenClaw ecom confirm request" },
      { status: 400 },
    );
  }
}
