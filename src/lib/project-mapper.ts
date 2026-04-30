import type {
  AITextResultNodeData,
  CanvasEdge,
  CanvasNode,
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
    content: "",
    model: "",
    generatedAt: new Date(0).toISOString(),
  };
}

function normalizeImageNodeData(value: unknown): ImageNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
      hostedImageUrl:
        typeof record.hostedImageUrl === "string"
          ? record.hostedImageUrl
          : undefined,
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: typeof record.model === "string" ? record.model : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
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
    imageUrl: "",
    prompt: "",
    generatedAt: new Date(0).toISOString(),
  };
}

function normalizeUploadedImageNodeData(value: unknown): UploadedImageNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
      hostedImageUrl:
        typeof record.hostedImageUrl === "string"
          ? record.hostedImageUrl
          : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      width: typeof record.width === "number" ? record.width : 320,
      height: typeof record.height === "number" ? record.height : 320,
    };
  }

  return {
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
