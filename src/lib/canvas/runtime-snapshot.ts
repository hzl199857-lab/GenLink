import type { CanvasEdge, CanvasNode } from "@/types/canvas";

export type CanvasRuntimeNodeStatus = "pending" | "running" | "finished" | "failed";

export type CanvasRuntimeSnapshotNode = {
  id: string;
  type: CanvasNode["type"];
  title?: string;
  logicalId?: string;
  agentNodeType?: string;
  status: CanvasRuntimeNodeStatus;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
  updatedAt?: string;
};

export type CanvasRuntimeSnapshot = {
  nodes: CanvasRuntimeSnapshotNode[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    pendingCount: number;
    runningCount: number;
    finishedCount: number;
    failedCount: number;
  };
};

function getImageGenerationOutputUrl(node: Extract<CanvasNode, { type: "image_generation" }>): string | undefined {
  return node.data.generatedHostedImageUrl?.trim() || node.data.generatedImageUrl?.trim() || undefined;
}

function getRuntimeStatus(node: CanvasNode): CanvasRuntimeNodeStatus {
  if (node.type === "image_generation") {
    const explicit = node.data.generationStatus;

    if (explicit === "pending" || explicit === "running" || explicit === "finished" || explicit === "failed") {
      return explicit;
    }

    if (node.data.status === "generating") {
      return "running";
    }

    if (node.data.status === "error") {
      return "failed";
    }

    return getImageGenerationOutputUrl(node) ? "finished" : "pending";
  }

  if ("status" in node.data && (node.data as { status?: unknown }).status === "error") {
    return "failed";
  }

  if ("status" in node.data && (node.data as { status?: unknown }).status === "generating") {
    return "running";
  }

  return "finished";
}

export function buildCanvasRuntimeSnapshot(params: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groupCount: number;
}): CanvasRuntimeSnapshot {
  const nodes = params.nodes.map((node): CanvasRuntimeSnapshotNode => {
    const status = getRuntimeStatus(node);

    if (node.type === "image_generation") {
      const errorMessage = node.data.generationErrorMessage || node.data.errorMessage;

      return {
        id: node.id,
        type: node.type,
        title: node.data.title,
        logicalId: node.data.agentLogicalId,
        agentNodeType: node.data.agentNodeType,
        status,
        outputUrl: getImageGenerationOutputUrl(node),
        errorCode: node.data.generationErrorCode,
        errorMessage,
        retryable: status === "failed" ? node.data.generationRetryable !== false : false,
        updatedAt: node.data.generationUpdatedAt || node.data.generatedAt,
      };
    }

    const data = node.data as {
      title?: string;
      agentLogicalId?: string;
      agentNodeType?: string;
      errorMessage?: string;
      generatedAt?: string;
    };

    return {
      id: node.id,
      type: node.type,
      title: data.title,
      logicalId: data.agentLogicalId,
      agentNodeType: data.agentNodeType,
      status,
      errorMessage: data.errorMessage,
      retryable: false,
      updatedAt: data.generatedAt,
    };
  });

  const counts = nodes.reduce(
    (acc, node) => {
      acc[`${node.status}Count`] += 1;
      return acc;
    },
    {
      pendingCount: 0,
      runningCount: 0,
      finishedCount: 0,
      failedCount: 0,
    } as Record<`${CanvasRuntimeNodeStatus}Count`, number>,
  );

  return {
    nodes,
    summary: {
      nodeCount: params.nodes.length,
      edgeCount: params.edges.length,
      groupCount: params.groupCount,
      pendingCount: counts.pendingCount,
      runningCount: counts.runningCount,
      finishedCount: counts.finishedCount,
      failedCount: counts.failedCount,
    },
  };
}
