import type {
  AITextResultNodeData,
  CanvasEdge,
  CanvasNode,
  ImageGenerationResultItem,
  ImageGenerationNodeData,
  ImageNodeData,
  NodeType,
  ProjectSnapshot,
  TextNodeData,
  UploadedImageNodeData,
} from "@/types/canvas";

interface DbProjectRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DbCanvasNodeRecord {
  id: string;
  projectId: string;
  type: string;
  positionX: number;
  positionY: number;
  data: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DbCanvasEdgeRecord {
  id: string;
  projectId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  createdAt: Date;
}

function isNodeType(value: string): value is NodeType {
  return (
    value === "text" ||
    value === "image_generation" ||
    value === "ai_text_result" ||
    value === "image" ||
    value === "uploaded_image"
  );
}

function parseNodeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid node data JSON");
  }
}

function normalizeTextNodeData(value: unknown): TextNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      text: typeof record.text === "string" ? record.text : "",
      title: typeof record.title === "string" ? record.title : undefined,
    };
  }

  return { text: "" };
}

function normalizeAITextResultNodeData(value: unknown): AITextResultNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      content: typeof record.content === "string" ? record.content : "",
      model: typeof record.model === "string" ? record.model : "",
      tokens: typeof record.tokens === "number" ? record.tokens : undefined,
      generatedAt:
        typeof record.generatedAt === "string"
          ? record.generatedAt
          : new Date(0).toISOString(),
      sourcePromptNodeId:
        typeof record.sourcePromptNodeId === "string"
          ? record.sourcePromptNodeId
          : undefined,
    };
  }

  return {
    title: "AI Text Result",
    content: "",
    model: "",
    generatedAt: new Date(0).toISOString(),
  };
}

function normalizeImageGenerationNodeData(value: unknown): ImageGenerationNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const rawParallelCount =
      typeof record.parallelCount === "number"
        ? record.parallelCount
        : typeof record.count === "number"
          ? record.count
          : undefined;
    const parallelCount =
      rawParallelCount === 2 || rawParallelCount === 4 ? rawParallelCount : 1;
    const generationResults: ImageGenerationResultItem[] | undefined =
      Array.isArray(record.generationResults)
        ? record.generationResults
            .filter((item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
            )
            .map((item) => ({
              status: item.status === "error" ? "error" : "completed",
              imageUrl:
                typeof item.imageUrl === "string" ? item.imageUrl : undefined,
              hostedImageUrl:
                typeof item.hostedImageUrl === "string"
                  ? item.hostedImageUrl
                  : undefined,
              model: typeof item.model === "string" ? item.model : undefined,
              width: typeof item.width === "number" ? item.width : undefined,
              height: typeof item.height === "number" ? item.height : undefined,
              format:
                typeof item.format === "string" ? item.format : undefined,
              sizeBytes:
                typeof item.sizeBytes === "number"
                  ? item.sizeBytes
                  : undefined,
              generatedAt:
                typeof item.generatedAt === "string"
                  ? item.generatedAt
                  : new Date(0).toISOString(),
              errorMessage:
                typeof item.errorMessage === "string"
                  ? item.errorMessage
                  : undefined,
            }))
        : undefined;

    return {
      title: typeof record.title === "string" ? record.title : "Image",
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: typeof record.model === "string" ? record.model : "gpt-image-2",
      generatedModel:
        typeof record.generatedModel === "string"
          ? record.generatedModel
          : undefined,
      aspectRatio: typeof record.aspectRatio === "string" ? record.aspectRatio : "auto",
      quality: typeof record.quality === "string" ? record.quality : "1K",
      detail: typeof record.detail === "string" ? record.detail : "medium",
      parallelCount,
      referenceImageUrl:
        typeof record.referenceImageUrl === "string"
          ? record.referenceImageUrl
          : undefined,
      referenceImages: Array.isArray(record.referenceImages)
        ? record.referenceImages
            .filter((item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
            )
            .map((item, index) => ({
              id:
                typeof item.id === "string" && item.id.trim()
                  ? item.id
                  : `reference-${index}`,
              imageUrl:
                typeof item.imageUrl === "string" ? item.imageUrl : "",
              hostedImageUrl:
                typeof item.hostedImageUrl === "string"
                  ? item.hostedImageUrl
                  : undefined,
              fileName:
                typeof item.fileName === "string" ? item.fileName : undefined,
              width: typeof item.width === "number" ? item.width : undefined,
              height: typeof item.height === "number" ? item.height : undefined,
              sizeBytes:
                typeof item.sizeBytes === "number" ? item.sizeBytes : undefined,
            }))
            .filter((item) => item.imageUrl.trim())
        : undefined,
      generatedImageUrl:
        typeof record.generatedImageUrl === "string"
          ? record.generatedImageUrl
          : undefined,
      generatedHostedImageUrl:
        typeof record.generatedHostedImageUrl === "string"
          ? record.generatedHostedImageUrl
          : undefined,
      generatedImageWidth:
        typeof record.generatedImageWidth === "number"
          ? record.generatedImageWidth
          : undefined,
      generatedImageHeight:
        typeof record.generatedImageHeight === "number"
          ? record.generatedImageHeight
          : undefined,
      generatedImageFormat:
        typeof record.generatedImageFormat === "string"
          ? record.generatedImageFormat
          : undefined,
      generatedImageSizeBytes:
        typeof record.generatedImageSizeBytes === "number"
          ? record.generatedImageSizeBytes
          : undefined,
      generatedAt:
        typeof record.generatedAt === "string"
          ? record.generatedAt
          : undefined,
      generationResults,
      status:
        record.status === "idle" ||
        record.status === "generating" ||
        record.status === "error"
          ? record.status
          : "idle",
      errorMessage:
        typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    };
  }

  return {
    title: "Image",
    prompt: "",
    model: "gpt-image-2",
    aspectRatio: "auto",
    quality: "1K",
    detail: "medium",
    parallelCount: 1,
    status: "idle",
  };
}

function normalizeImageNodeData(value: unknown): ImageNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
      hostedImageUrl:
        typeof record.hostedImageUrl === "string"
          ? record.hostedImageUrl
          : undefined,
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: typeof record.model === "string" ? record.model : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      sizeBytes:
        typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      generatedAt:
        typeof record.generatedAt === "string"
          ? record.generatedAt
          : new Date(0).toISOString(),
      sourcePromptNodeId:
        typeof record.sourcePromptNodeId === "string"
          ? record.sourcePromptNodeId
          : undefined,
    };
  }

  return {
    title: "Image",
    imageUrl: "",
    prompt: "",
    generatedAt: new Date(0).toISOString(),
  };
}

function normalizeUploadedImageNodeData(value: unknown): UploadedImageNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
      hostedImageUrl:
        typeof record.hostedImageUrl === "string"
          ? record.hostedImageUrl
          : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      width: typeof record.width === "number" ? record.width : 320,
      height: typeof record.height === "number" ? record.height : 320,
      displayWidth:
        typeof record.displayWidth === "number" ? record.displayWidth : undefined,
      displayHeight:
        typeof record.displayHeight === "number" ? record.displayHeight : undefined,
      sizeBytes:
        typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    };
  }

  return {
    title: "image",
    imageUrl: "",
    width: 320,
    height: 320,
  };
}

function nodeFromDbRecord(record: DbCanvasNodeRecord): CanvasNode {
  const parsed = parseNodeJson(record.data);

  if (record.type === "prompt") {
    throw new Error('Legacy "prompt" nodes are no longer supported');
  }

  if (!isNodeType(record.type)) {
    console.warn(`Unknown canvas node type "${record.type}", coercing to text`);

    return {
      id: record.id,
      type: "text",
      position: {
        x: record.positionX,
        y: record.positionY,
      },
      data: normalizeTextNodeData(parsed),
    };
  }

  switch (record.type) {
    case "text":
      return {
        id: record.id,
        type: "text",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeTextNodeData(parsed),
      };
    case "image_generation":
      return {
        id: record.id,
        type: "image_generation",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeImageGenerationNodeData(parsed),
      };
    case "ai_text_result":
      return {
        id: record.id,
        type: "ai_text_result",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeAITextResultNodeData(parsed),
      };
    case "image":
      return {
        id: record.id,
        type: "image",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeImageNodeData(parsed),
      };
    case "uploaded_image":
      return {
        id: record.id,
        type: "uploaded_image",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeUploadedImageNodeData(parsed),
      };
  }
}

function edgeFromDbRecord(record: DbCanvasEdgeRecord): CanvasEdge {
  return {
    id: record.id,
    source: record.source,
    target: record.target,
    sourceHandle: record.sourceHandle ?? undefined,
    targetHandle: record.targetHandle ?? undefined,
  };
}

export function dbToSnapshot(
  project: DbProjectRecord,
  nodes: DbCanvasNodeRecord[],
  edges: DbCanvasEdgeRecord[],
): ProjectSnapshot {
  const filteredNodes = nodes.filter((node) => node.type !== "prompt");
  const validNodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter(
    (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target),
  );

  return {
    id: project.id,
    name: project.name,
    nodes: filteredNodes.map(nodeFromDbRecord),
    edges: filteredEdges.map(edgeFromDbRecord),
    materials: undefined,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function snapshotToDb(snapshot: ProjectSnapshot): {
  project: {
    id: string;
    name: string;
  };
  nodes: Array<{
    id: string;
    projectId: string;
    type: NodeType;
    positionX: number;
    positionY: number;
    data: string;
  }>;
  edges: Array<{
    id: string;
    projectId: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  }>;
} {
  return {
    project: {
      id: snapshot.id,
      name: snapshot.name,
    },
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      projectId: snapshot.id,
      type: node.type,
      positionX: node.position.x,
      positionY: node.position.y,
      data: JSON.stringify(node.data),
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      projectId: snapshot.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}
