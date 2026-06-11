import { NextResponse } from "next/server";

import { mapAgentPanelModelToOpenClaw } from "@/lib/openclaw/model-mapping";
import {
  startPlanfEcomSession,
  type OpenClawPlanfEcomSession,
  type PlanfEcomPresetId,
} from "@/lib/openclaw/planf-ecom-session";
import { runRealOpenClaw } from "@/lib/openclaw/real-runtime";
import {
  normalizeOpenClawFormFieldsForPreset,
  parseOpenClawFormFields,
} from "@/lib/openclaw/runtime";
import { shouldUseRealOpenClawRuntime } from "@/lib/openclaw/start-policy";
import type { ImageApiProvider } from "@/lib/vibe";

export const runtime = "nodejs";

const FORM_FIELDS_MODEL_TIMEOUT_MS = 5 * 60_000;

type StartRequestBody = {
  request?: unknown;
  preset?: unknown;
  referenceImageCount?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

function parsePreset(value: unknown): PlanfEcomPresetId | undefined {
  return value === "full-set-8" ||
    value === "detail-page-pack" ||
    value === "amazon-adapter" ||
    value === "ugc-lifestyle" ||
    value === "editorial-stylist"
    ? value
    : undefined;
}

function parseProvider(value: unknown): ImageApiProvider | undefined {
  return value === "vibe" ||
    value === "fucheers" ||
    value === "comfly" ||
    value === "zhenzhen" ||
    value === "grsai"
    ? value
    : undefined;
}

function buildRealOpenClawStartMessage(params: {
  request: string;
  preset: PlanfEcomPresetId;
  referenceImageCount: number;
}): string {
  return [
    "You are the GenLink embedded rules/protocol decision layer. The user-visible brand is always GenLink.",
    "Read the current OpenClaw workspace rules starting from ./AGENTS.md, then ./BOOTSTRAP.md, ./IDENTITY.md, ./phase-policy.md, and ./skills/ecom-image/SKILL.md when needed.",
    "You may use RH / PlanF Canvas internally as the canonical protocol architecture, but do not call yourself RH, RunningHub, or PlanF in user-visible text.",
    "Current stage: ecom-image entry triage and form-fields only.",
    "Do not create canvas nodes. Do not call genlink_canvas_create_workflow. Do not output creative-doc or workflow-json.",
    "Return pure JSON only. No Markdown. No explanation. No trace text.",
    "Return exactly one JSON object for the schema below.",
    "The first non-whitespace character of your response must be { and the last non-whitespace character must be }.",
    "Do not output any preface, explanation, status text, tool call, command snippet, markdown fence, or trace before or after the JSON object.",
    "If you read or consult rules internally, do not describe that action in the response.",
    "JSON schema: {\"type\":\"form-fields\",\"fields\":[...],\"route\":\"ecomImageTrack\",\"nextAction\":\"await-form-submit\",\"loadedFiles\":[\"AGENTS.md\",\"BOOTSTRAP.md\",\"IDENTITY.md\",\"phase-policy.md\"]}",
    "Allowed field types: text, select, multi-select, upload.",
    "select and multi-select options must be objects shaped as {\"label\":\"...\",\"value\":\"...\"}.",
    "The fields array must include productName, category, and platform. The local UI may hide already-known fields later, but this protocol output must remain complete for validation.",
    "If productName can be extracted from userRequest, include productName with that value.",
    "If category can be confidently inferred from productName, include category with that default value.",
    "If referenceImageCount > 0, productAsset may still be included so the protocol remains complete; the UI can hide it when a reference image already exists.",
    "For sellingPoints, include source: user_explicit | model_suggested | default_guess.",
    "Use source=user_explicit only when userRequest explicitly names 1-3 selling points or benefits. Use source=model_suggested when you can suggest plausible choices from a known product/category. Use source=default_guess when only a generic product name is known and the core selling point is commercially ambiguous.",
    "When sellingPoints source=user_explicit, use type=text and value containing the user's selling points. When source=model_suggested, use type=multi-select with concise choices. When source=default_guess, use type=text with empty value and a helpful placeholder.",
    "When preset=full-set-8 and the user did not explicitly ask for detail-page, UGC, or editorial-stylist output, allowed field ids are: productName, productAsset, category, platform, sellingPoints, imageSet, styleMode, mainColor.",
    "",
    `preset=${params.preset}`,
    `referenceImageCount=${params.referenceImageCount}`,
    `userRequest=${params.request}`,
  ].join("\n");
}

function applyRuntimeFormFields(
  session: OpenClawPlanfEcomSession,
  fields: OpenClawPlanfEcomSession["fields"],
): void {
  const productField = fields.find((field) => field.id === "productName");
  const fallbackProductField = session.fields.find((field) => (
    field.id === "productName" && field.type === "text"
  ));
  const fallbackProductValue = typeof fallbackProductField?.value === "string"
    ? fallbackProductField.value
    : "";

  if (productField?.type === "text") {
    productField.value = fallbackProductValue;
  }

  session.fields = fields;
  session.message = "GenLink 已按规则库生成表单。请补齐这些参数，提交后进入电商图编排与画布工作流创建。";
  session.protocol = {
    name: "form-fields",
    trigger: "GenLink read the top-level rules and returned structured form-fields.",
    responsePath: "After the user submits the form values, continue to ecom-image/SKILL.md Step 2 and generate creative-doc / workflow-json.",
  };
  session.thinkingSteps = [
    { label: "GenLink 启动", detail: "先读取 GenLink 规则库，按 AGENTS.md / BOOTSTRAP.md 做入口判断。" },
    { label: "路由判定", detail: "route=ecomImageTrack; nextAction=await-form-submit" },
    { label: "规则加载", detail: "loadedFiles=AGENTS.md, BOOTSTRAP.md, IDENTITY.md, phase-policy.md" },
    { label: "协议输出", detail: "GenLink 返回 form-fields，前端进入表单收集阶段。" },
    { label: "下一步", detail: "用户回填后进入 creative-doc，再生成 workflow-json。" },
  ];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartRequestBody;
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    const preset = parsePreset(body.preset);

    if (!userRequest || !preset) {
      return NextResponse.json(
        { ok: false, error: "request and preset are required" },
        { status: 400 },
      );
    }

    const referenceImageCount =
      typeof body.referenceImageCount === "number"
        ? body.referenceImageCount
        : 0;
    const provider = parseProvider(body.provider);
    const model = typeof body.model === "string" ? body.model : undefined;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const session = startPlanfEcomSession({
      request: userRequest,
      preset,
      referenceImageCount,
    });

    if (!shouldUseRealOpenClawRuntime()) {
      return NextResponse.json(
        { ok: false, error: "OPENCLAW_REAL_RUNTIME=0 disables the real OpenClaw runtime." },
        { status: 502 },
      );
    }

    const real = await runRealOpenClaw({
      message: buildRealOpenClawStartMessage({
        request: userRequest,
        preset,
        referenceImageCount,
      }),
      sessionKey: `genlink-planf-start-${session.sessionId}`,
      timeoutMs: FORM_FIELDS_MODEL_TIMEOUT_MS,
      provider,
      model: mapAgentPanelModelToOpenClaw({ provider, model }),
      apiKey,
    });
    const fields = parseOpenClawFormFields(real.text);

    if (!fields) {
      return NextResponse.json(
        { ok: false, error: "GenLink rules runtime did not return valid form-fields JSON." },
        { status: 502 },
      );
    }

    applyRuntimeFormFields(session, normalizeOpenClawFormFieldsForPreset(fields, preset));

    return NextResponse.json({
      ok: true,
      session,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("[openclaw-planf-ecom-start] failed", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      if (
        error.name === "RealOpenClawRuntimeError" ||
        error.message.startsWith("OpenClaw ")
      ) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 502 },
        );
      }

      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 502 },
      );
    }

    console.error("[openclaw-planf-ecom-start] failed with non-error", error);

    return NextResponse.json(
      { ok: false, error: "Invalid OpenClaw ecom start request" },
      { status: 400 },
    );
  }
}
