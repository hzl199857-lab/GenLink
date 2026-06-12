import type { CanvasAgentAction } from "@/types/agent";
import type { CanvasNode } from "@/types/canvas";

function isSupportedImageProvider(
  provider: string | undefined,
): CanvasNode extends infer T
  ? T extends { type: "image_generation"; data: infer D }
    ? D extends { provider?: infer P }
      ? P | undefined
      : undefined
    : never
  : never {
  if (
    provider === "vibe" ||
    provider === "fucheers" ||
    provider === "comfly" ||
    provider === "zhenzhen" ||
    provider === "runninghub" ||
    provider === "grsai"
  ) {
    return provider as never;
  }

  return undefined as never;
}

function isRunningHubChannel(channel: string | undefined): channel is "official" | "low-cost" {
  return channel === "official" || channel === "low-cost";
}

export function applyImageGenerationActionOptionsToMaterializedNodes(params: {
  nodes: CanvasNode[] | undefined;
  actions: CanvasAgentAction[];
  nodeIdMap?: Record<string, string>;
}): CanvasNode[] | undefined {
  if (!params.nodes?.length) {
    return params.nodes;
  }

  const imageActions = params.actions.filter((action) => action.type === "create_image_generation_node");
  if (imageActions.length === 0) {
    return params.nodes;
  }

  const actionByRealNodeId = new Map<string, Extract<CanvasAgentAction, { type: "create_image_generation_node" }>>();
  imageActions.forEach((action, index) => {
    const mappedNodeId = params.nodeIdMap?.[action.clientActionId];
    const fallbackNode = params.nodes?.filter((node) => node.type === "image_generation")[index];
    const realNodeId = mappedNodeId ?? fallbackNode?.id;

    if (realNodeId) {
      actionByRealNodeId.set(realNodeId, action);
    }
  });

  return params.nodes.map((node) => {
    if (node.type !== "image_generation") {
      return node;
    }

    const action = actionByRealNodeId.get(node.id);
    if (!action) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        prompt: action.prompt || node.data.prompt,
        provider: isSupportedImageProvider(action.options?.provider) ?? node.data.provider,
        model: action.options?.model ?? node.data.model,
        runningHubChannel: isRunningHubChannel(action.options?.runningHubChannel)
          ? action.options.runningHubChannel
          : node.data.runningHubChannel,
        aspectRatio: action.options?.aspectRatio ?? node.data.aspectRatio,
        quality: action.options?.quality ?? node.data.quality,
      },
    };
  });
}
