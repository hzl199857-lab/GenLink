import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { isAgentTextProvider } from "@/lib/agent-provider-options";
import { proxyOpenClawRequest } from "@/lib/openclaw/backend-proxy";
import {
  createPlanfEcomWorkflowFromAnchor,
  createPlanfEcomWorkflowFromPlan,
  type OpenClawPlanfEcomSession,
} from "@/lib/openclaw/planf-ecom-session";
import {
  normalizeOpenClawEcomCreativeDoc,
  buildOpenClawEcomWorkflowMessage,
  parseOpenClawEcomWorkflow,
} from "@/lib/openclaw/ecom-protocol";
import { reconcileOpenClawEcomPlanReferenceMode } from "@/lib/openclaw/ecom-plan-reference";
import {
  AgentModelCompatibilityError,
  mapAgentPanelModelToOpenClaw,
} from "@/lib/openclaw/model-mapping";
import {
  createOpenClawMcpClient,
  OpenClawMcpClientError,
} from "@/lib/openclaw/mcp-client";
import { validateGLWorkflowForCanvas } from "@/lib/canvas/canvas-tool-gateway";
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
import type { CanvasAgentAction } from "@/types/agent";
import type { GLWorkflow } from "@/lib/planf-ecom";

export const runtime = "nodejs";

const ECOM_WORKFLOW_TIMEOUT_MS = 5 * 60_000;

type CreateWorkflowRequestBody = {
  session?: unknown;
  values?: unknown;
  plan?: unknown;
  references?: unknown;
  anchor?: unknown;
  projectId?: unknown;
  canvasId?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

function errorJson(
  error: string,
  status: number,
  stage: "parse_request" | "generate_workflow" | "materialize_canvas",
  diagnostic?: ReturnType<typeof getPublicRealOpenClawRuntimeDiagnostic>,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      stage,
      retryable: stage !== "parse_request",
      ...(diagnostic ? { diagnostic } : {}),
    },
    { status },
  );
}

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

function parseAnchor(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : "";
  const outputUrl = typeof record.outputUrl === "string" ? record.outputUrl.trim() : "";

  if (!nodeId || !outputUrl) {
    return undefined;
  }

  return { nodeId, outputUrl };
}

function parsePlan(value: unknown) {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeOpenClawEcomCreativeDoc(value);
  } catch {
    return undefined;
  }
}

function parseReferences(value: unknown): Array<{ attachmentId: string; name?: string; sourceNodeId: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const attachmentId = typeof record.attachmentId === "string" ? record.attachmentId.trim() : "";
    const sourceNodeId = typeof record.sourceNodeId === "string" ? record.sourceNodeId.trim() : "";

    if (!attachmentId || !sourceNodeId) {
      return [];
    }

    return [{
      attachmentId,
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined,
      sourceNodeId,
    }];
  });
}

function isExistingAnchorConnection(action: CanvasAgentAction): boolean {
  return action.type === "connect_nodes" && action.sourceRef.kind === "existing";
}

function mergeWorkflowActionsWithoutDuplicateConnections(
  primaryActions: CanvasAgentAction[],
  fallbackActions: CanvasAgentAction[],
): CanvasAgentAction[] {
  const merged: CanvasAgentAction[] = [];
  const connectionKeys = new Set<string>();

  for (const action of [...primaryActions, ...fallbackActions]) {
    if (action.type !== "connect_nodes") {
      merged.push(action);
      continue;
    }

    const sourceKey = action.sourceRef.kind === "existing"
      ? `existing:${action.sourceRef.nodeId}`
      : `created:${action.sourceRef.clientActionId}`;
    const targetKey = action.targetRef.kind === "existing"
      ? `existing:${action.targetRef.nodeId}`
      : `created:${action.targetRef.clientActionId}`;
    const key = `${sourceKey}->${targetKey}`;

    if (connectionKeys.has(key)) {
      continue;
    }

    connectionKeys.add(key);
    merged.push(action);
  }

  return merged;
}

function getAllowedExistingSourceIds(input: {
  references: ReturnType<typeof parseReferences>;
  anchor: ReturnType<typeof parseAnchor>;
}): string[] {
  return [
    ...input.references.map((reference) => reference.sourceNodeId),
    input.anchor?.nodeId,
  ].flatMap((nodeId) => {
    const trimmed = nodeId?.trim();

    return trimmed ? [trimmed] : [];
  });
}

function parseAndValidateOpenClawWorkflow(input: {
  text: string;
  allowedExistingSourceIds: string[];
}): GLWorkflow {
  const workflow = parseOpenClawEcomWorkflow(input.text);
  const validation = validateGLWorkflowForCanvas(workflow, {
    allowedExistingSourceIds: input.allowedExistingSourceIds,
  });

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return workflow;
}

async function tryRunOpenClawWorkflow(input: Parameters<typeof runOpenClawWorkflow>[0]) {
  try {
    return await runOpenClawWorkflow(input);
  } catch (error) {
    if (
      error instanceof AgentModelCompatibilityError ||
      error instanceof RealOpenClawRuntimeError ||
      error instanceof PlanfRulesContextError
    ) {
      throw error;
    }

    console.warn("[openclaw/planf/ecom/create-workflow] using local workflow fallback", error);

    return undefined;
  }
}

async function runOpenClawWorkflow(input: {
  session: OpenClawPlanfEcomSession;
  values: NonNullable<ReturnType<typeof parseValues>>;
  plan: NonNullable<ReturnType<typeof parsePlan>>;
  anchor: ReturnType<typeof parseAnchor>;
  references: ReturnType<typeof parseReferences>;
  provider?: string;
  model?: string;
  apiKey?: string;
}) {
  const openClawProvider = isAgentTextProvider(input.provider) ? input.provider : undefined;
  const mappedModel = mapAgentPanelModelToOpenClaw({
    provider: openClawProvider,
    model: input.model,
  });
  const allowedExistingSourceIds = getAllowedExistingSourceIds({
    references: input.references,
    anchor: input.anchor,
  });
  const first = await runRealOpenClaw({
    message: await buildPlanfEcomRulesMessage({
      stage: "workflow",
      preset: input.session.preset,
      imageSet: input.values.imageSet,
      styleMode: input.values.styleMode,
      taskMessage: buildOpenClawEcomWorkflowMessage({
        session: input.session,
        values: input.values,
        plan: input.plan,
        anchor: input.anchor,
        referenceNodeMap: input.references,
      }),
    }),
    sessionKey: `genlink-planf-workflow-${input.session.sessionId}`,
    timeoutMs: ECOM_WORKFLOW_TIMEOUT_MS,
    provider: openClawProvider,
    model: mappedModel,
    apiKey: input.apiKey,
  });

  try {
    return parseAndValidateOpenClawWorkflow({
      text: first.text,
      allowedExistingSourceIds,
    });
  } catch (error) {
    const firstMessage = error instanceof Error ? error.message : "workflow validation failed";
    const repaired = await runRealOpenClaw({
      message: await buildPlanfEcomRulesMessage({
        stage: "workflow",
        preset: input.session.preset,
        imageSet: input.values.imageSet,
        styleMode: input.values.styleMode,
        taskMessage: buildOpenClawEcomWorkflowMessage({
          session: input.session,
          values: input.values,
          plan: input.plan,
          anchor: input.anchor,
          referenceNodeMap: input.references,
          previousText: first.text,
          previousValidationError: firstMessage,
        }),
      }),
      sessionKey: `genlink-planf-workflow-repair-${input.session.sessionId}`,
      timeoutMs: ECOM_WORKFLOW_TIMEOUT_MS,
      provider: openClawProvider,
      model: mappedModel,
      apiKey: input.apiKey,
    });

    try {
      return parseAndValidateOpenClawWorkflow({
        text: repaired.text,
        allowedExistingSourceIds,
      });
    } catch (repairError) {
      const repairMessage = repairError instanceof Error ? repairError.message : "workflow repair parse failed";
      throw new Error([
        `GenLink rules runtime did not return a valid workflow-json. first=${firstMessage}; repair=${repairMessage}.`,
        `firstText=${first.text.slice(0, 800)}`,
        `repairText=${repaired.text.slice(0, 800)}`,
      ].join(" "));
    }
  }
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const proxied = await proxyOpenClawRequest(request);

    if (proxied) {
      return proxied;
    }

    const body = (await request.json()) as CreateWorkflowRequestBody;
    const session = parseSession(body.session);
    const values = parseValues(body.values);
    const parsedPlan = parsePlan(body.plan);
    const anchor = parseAnchor(body.anchor);
    const references = parseReferences(body.references);
    const projectId = typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : "local-dev-project";
    const canvasId = typeof body.canvasId === "string" && body.canvasId.trim()
      ? body.canvasId.trim()
      : "default";

    if (!session || !values || !parsedPlan) {
      return errorJson("session, values, and confirmed plan are required", 400, "parse_request");
    }

    const plan = reconcileOpenClawEcomPlanReferenceMode(parsedPlan, session, values);

    if (!shouldUseRealOpenClawRuntime()) {
      return errorJson("OPENCLAW_REAL_RUNTIME=0 disables the real OpenClaw runtime.", 502, "generate_workflow");
    }

    const localResponse = anchor
      ? createPlanfEcomWorkflowFromAnchor({ session, values, anchor })
      : createPlanfEcomWorkflowFromPlan({ session, values });
    const workflow = await tryRunOpenClawWorkflow({
      session,
      values,
      plan,
      anchor,
      references,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    });
    const response = {
      ...localResponse,
      workflow: workflow ?? localResponse.workflow,
    };

    const mcp = createOpenClawMcpClient({
      userId: "openclaw-api-user",
      projectId,
      canvasId,
      permissions: {
        read: true,
        write: true,
        generate: false,
      },
    });
    const toolResult = await mcp.createWorkflow({
      projectId,
      canvasId,
      workflow: response.workflow,
      placement: { mode: "viewport_center_right" },
      allowedExistingSourceIds: getAllowedExistingSourceIds({ references, anchor }),
    });

    const mcpActions = toolResult.actions ?? response.actions.filter((action) => !isExistingAnchorConnection(action));
    const existingAnchorActions = response.actions.filter(isExistingAnchorConnection);

    return NextResponse.json({
      ...response,
      summary: "GenLink 已产出画布工作流，并物化为画布节点。",
      actions: mergeWorkflowActionsWithoutDuplicateConnections(mcpActions, existingAnchorActions),
      nodes: toolResult.nodes,
      edges: toolResult.edges,
      nodeIdMap: toolResult.nodeIdMap,
      edgeIdMap: toolResult.edgeIdMap,
      mcp: {
        toolName: "genlink_canvas_create_workflow",
        auditId: toolResult.auditId,
        message: toolResult.message,
        createdNodeIds: toolResult.createdNodeIds,
        createdEdgeIds: toolResult.createdEdgeIds,
        nodeIdMap: toolResult.nodeIdMap,
        edgeIdMap: toolResult.edgeIdMap,
      },
    });
  } catch (error) {
    if (error instanceof AgentModelCompatibilityError) {
      return errorJson(error.message, 400, "parse_request");
    }

    if (error instanceof RealOpenClawRuntimeError) {
      return errorJson(
        error.publicMessage ?? error.message,
        504,
        "generate_workflow",
        getPublicRealOpenClawRuntimeDiagnostic(error.diagnostic),
      );
    }

    if (error instanceof OpenClawMcpClientError) {
      return errorJson(error.message, 502, "materialize_canvas");
    }

    if (error instanceof PlanfRulesContextError) {
      return errorJson(error.message, 502, "generate_workflow");
    }

    const message = error instanceof Error
      ? error.message
      : "Invalid OpenClaw ecom create workflow request";

    console.error("[openclaw/planf/ecom/create-workflow]", error);

    return errorJson(message, 400, "parse_request");
  }
}
