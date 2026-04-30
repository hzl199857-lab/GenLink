"use client";

import { create } from "zustand";

import type {
  AITextResultNodeData,
  CanvasEdge,
  CanvasNode,
  ImageGenerationNodeData,
  ImageNodeData,
  NodeType,
  ProjectSnapshot,
  TextNodeData,
  UploadedImageNodeData,
} from "@/types/canvas";

type ProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
};

type ApiErrorResponse = {
  ok: false;
  error: string;
};

type ImageJobPollResponse =
  | ApiErrorResponse
  | {
      ok: true;
      jobId: string;
      status: "pending";
    }
  | {
      ok: true;
      jobId: string;
      status: "error";
      error: string;
    }
  | {
      ok: true;
      jobId: string;
      status: "completed";
      result: {
        imageUrl: string;
        hostedImageUrl?: string;
        model: string;
        width: number;
        height: number;
        format?: string;
        sizeBytes?: number;
      };
    };

export const CANVAS_TEXT_API_KEY_STORAGE_KEY = "genlink.vibeTextApiKey";
export const CANVAS_IMAGE_API_KEY_STORAGE_KEY = "genlink.vibeImageApiKey";
function readStoredApiKey(storageKey: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(storageKey)?.trim() ?? "";
}

function readStoredTextApiKey(): string {
  return readStoredApiKey(CANVAS_TEXT_API_KEY_STORAGE_KEY);
}

function readStoredImageApiKey(): string {
  return readStoredApiKey(CANVAS_IMAGE_API_KEY_STORAGE_KEY);
}

type AiTextStreamEvent =
  | {
      type: "delta";
      delta?: string;
    }
  | {
      type: "done";
      result?: {
        content: string;
        model: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }
  | {
      type: "error";
      error?: string;
    };

type ConnectedImagePayload = {
  id: string;
  imageUrl: string;
  originalImageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  alt: string;
  sourceType: "image" | "uploaded_image";
  width?: number;
  height?: number;
};

type ProjectsListSuccessResponse = {
  ok: true;
  projects: Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ProjectMutationSuccessResponse = {
  ok: true;
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
};

type ProjectSnapshotSuccessResponse = {
  ok: true;
  snapshot: ProjectSnapshot;
};

const TEXT_SYSTEM_PROMPT =
  "Only output the final result. Do not include extra commentary. If there are multiple possible results, return just one.";

const IMAGE_SIZE_PRESETS = {
  "1K": {
    "1:1": "1024x1024",
    "16:9": "1280x720",
    "9:16": "720x1280",
    "4:3": "1152x864",
    "3:4": "864x1152",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "5:4": "1120x896",
    "4:5": "896x1120",
    "21:9": "1456x624",
    "9:21": "624x1456",
  },
  "2K": {
    "1:1": "2048x2048",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "5:4": "2240x1792",
    "4:5": "1792x2240",
    "21:9": "3024x1296",
    "9:21": "1296x3024",
  },
  "4K": {
    "1:1": "2880x2880",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "4:3": "3264x2448",
    "3:4": "2448x3264",
    "3:2": "3504x2336",
    "2:3": "2336x3504",
    "5:4": "3200x2560",
    "4:5": "2560x3200",
    "21:9": "3696x1584",
    "9:21": "1584x3696",
  },
} as const;

const SUPPORTED_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "21:9",
  "9:21",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function isClaudeModel(model?: string): boolean {
  return typeof model === "string" && /^claude-/i.test(model);
}

function createTextNodeData(): TextNodeData {
  return {
    text: "",
    model: "gpt-5.4",
    status: "idle",
  };
}

function createImageGenerationNodeData(): ImageGenerationNodeData {
  return {
    title: "Image",
    prompt: "",
    model: "gpt-image-2",
    aspectRatio: "auto",
    quality: "1K",
    detail: "medium",
    count: 5,
    status: "idle",
  };
}

function createAITextResultNodeData(): AITextResultNodeData {
  return {
    content: "",
    model: "",
    generatedAt: nowIso(),
  };
}

function createImageNodeData(): ImageNodeData {
  return {
    imageUrl: "",
    prompt: "",
    generatedAt: nowIso(),
  };
}

function createUploadedImageNodeData(): UploadedImageNodeData {
  return {
    imageUrl: "",
    width: 320,
    height: 320,
  };
}

function createNode(type: NodeType, position: { x: number; y: number }): CanvasNode {
  switch (type) {
    case "text":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createTextNodeData(),
      };
    case "ai_text_result":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createAITextResultNodeData(),
      };
    case "image_generation":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createImageGenerationNodeData(),
      };
    case "image":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createImageNodeData(),
      };
    case "uploaded_image":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createUploadedImageNodeData(),
      };
  }
}

function createSnapshot(state: {
  projectId: string | null;
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}): ProjectSnapshot {
  const timestamp = nowIso();

  return {
    id: state.projectId ?? crypto.randomUUID(),
    name: state.projectName.trim() || "Untitled",
    nodes: state.nodes,
    edges: state.edges,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Internal error";
}

async function persistGeneratedImage(
  imageUrl: string,
  prompt: string,
): Promise<string | undefined> {
  if (!imageUrl.startsWith("data:")) {
    return undefined;
  }

  const response = await fetch("/api/image-hosting/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dataUrl: imageUrl,
      fileName: `${prompt || "generated-image"}.png`,
    }),
  });

  const json = (await response.json()) as
    | {
        ok: true;
        result: {
          imageUrl: string;
        };
      }
    | ApiErrorResponse;

  if (!response.ok || !("ok" in json) || json.ok === false) {
    throw new Error("error" in json ? json.error : "Image hosting failed");
  }

  return json.result.imageUrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollImageGenerationJob(jobId: string): Promise<Extract<ImageJobPollResponse, { ok: true; status: "completed" }>["result"]> {
  const startedAt = Date.now();
  const timeoutMs = 10 * 60_000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`/api/ai/image?jobId=${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = (await response.json()) as ImageJobPollResponse;

    if (!response.ok || ("ok" in json && json.ok === false)) {
      throw new Error("error" in json ? json.error : "Image polling failed");
    }

    if (json.status === "completed") {
      return json.result;
    }

    if (json.status === "error") {
      throw new Error(json.error || "Image generation failed");
    }

    await sleep(2000);
  }

  throw new Error("Image generation polling timed out");
}

async function assertOkResponse<TSuccess extends { ok: true }>(
  response: Response,
): Promise<TSuccess> {
  const json = (await response.json()) as TSuccess | ApiErrorResponse;

  if (!response.ok || ("ok" in json && json.ok === false)) {
    throw new Error("error" in json ? json.error : "Request failed");
  }

  return json as TSuccess;
}

function resolveImageApiQuality(detail?: string): "low" | "medium" | "high" {
  if (detail === "low" || detail === "high") {
    return detail;
  }

  return "medium";
}

function resolveNearestAspectRatio(
  width?: number,
  height?: number,
): keyof (typeof IMAGE_SIZE_PRESETS)["1K"] {
  if (!width || !height || width <= 0 || height <= 0) {
    return "1:1";
  }

  const ratio = width / height;
  let best = SUPPORTED_IMAGE_ASPECT_RATIOS[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of SUPPORTED_IMAGE_ASPECT_RATIOS) {
    const [w, h] = option.split(":").map(Number);
    const delta = Math.abs(ratio - w / h);

    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }

  return best;
}

function resolveImageSize(
  sizeTier: string | undefined,
  aspectRatio: string | undefined,
  connectedImages: ConnectedImagePayload[],
): string {
  const normalizedSizeTier =
    sizeTier === "2K" || sizeTier === "4K" ? sizeTier : "1K";
  const presets = IMAGE_SIZE_PRESETS[normalizedSizeTier];

  if (aspectRatio === "auto") {
    const primaryImage = connectedImages[0];

    if (!primaryImage) {
      return "auto";
    }

    return presets[
      resolveNearestAspectRatio(primaryImage.width, primaryImage.height)
    ];
  }

  if (
    aspectRatio &&
    Object.prototype.hasOwnProperty.call(presets, aspectRatio)
  ) {
    return presets[aspectRatio as keyof typeof presets];
  }

  return presets["1:1"];
}

async function readTextStreamResponse(
  response: Response,
  handlers: {
    onDelta?: (delta: string) => void;
  } = {},
): Promise<NonNullable<Extract<AiTextStreamEvent, { type: "done" }>["result"]>> {
  if (!response.ok) {
    const text = await response.text();

    try {
      const json = JSON.parse(text) as ApiErrorResponse;
      throw new Error(json.error || "Request failed");
    } catch {
      throw new Error(text || "Request failed");
    }
  }

  if (!response.body) {
    throw new Error("Stream response body is missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult:
    | NonNullable<Extract<AiTextStreamEvent, { type: "done" }>["result"]>
    | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");

        if (separatorIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length === 0) {
          continue;
        }

        const event = JSON.parse(dataLines.join("\n")) as AiTextStreamEvent;

        if (event.type === "delta") {
          handlers.onDelta?.(event.delta ?? "");
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.error || "Text stream failed");
        }

        if (event.type === "done" && event.result) {
          finalResult = event.result;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    throw new Error("Stream ended before the final result was received");
  }

  return finalResult;
}

function setTextNodeStatus(
  nodes: CanvasNode[],
  textNodeId: string,
  status: NonNullable<TextNodeData["status"]>,
  errorMessage?: string,
): CanvasNode[] {
  return nodes.map((node) =>
    node.id === textNodeId && node.type === "text"
      ? {
          ...node,
          data: {
            ...node.data,
            status,
            errorMessage,
          },
        }
      : node,
  );
}

function getConnectedImagesForTargetNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): ConnectedImagePayload[] {
  const connectedSourceIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.source);

  return connectedSourceIds.reduce<ConnectedImagePayload[]>((acc, sourceId) => {
    const sourceNode = nodes.find((node) => node.id === sourceId);

    if (!sourceNode) {
      return acc;
    }

    if (sourceNode.type === "uploaded_image") {
      if (!sourceNode.data.imageUrl.trim()) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl:
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        originalImageUrl: sourceNode.data.imageUrl,
        hostedImageUrl: sourceNode.data.hostedImageUrl?.trim() || undefined,
        fileName: sourceNode.data.fileName,
        alt: sourceNode.data.fileName?.trim() || "Connected image",
        sourceType: "uploaded_image",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
      });
      return acc;
    }

    if (sourceNode.type === "image") {
      if (!sourceNode.data.imageUrl.trim()) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl:
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        originalImageUrl: sourceNode.data.imageUrl,
        hostedImageUrl: sourceNode.data.hostedImageUrl?.trim() || undefined,
        fileName: undefined,
        alt: sourceNode.data.prompt?.trim() || "Generated image",
        sourceType: "image",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
      });
      return acc;
    }

    if (sourceNode.type === "image_generation") {
      if (!sourceNode.data.generatedImageUrl?.trim()) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl: sourceNode.data.generatedImageUrl,
        originalImageUrl: sourceNode.data.generatedImageUrl,
        alt: sourceNode.data.prompt?.trim() || "Generated image",
        sourceType: "image",
        width: sourceNode.data.generatedImageWidth,
        height: sourceNode.data.generatedImageHeight,
      });
      return acc;
    }

    return acc;
  }, []);
}

export interface CanvasState {
  projectId: string | null;
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  loading: boolean;
  error: string | null;

  addNode: (node: CanvasNode) => void;
  addNodeAtCenter: (
    type: NodeType,
    viewportCenter: { x: number; y: number },
  ) => CanvasNode;
  updateNodeData: <T extends NodeType>(
    id: string,
    partial: Partial<Extract<CanvasNode, { type: T }>["data"]>,
  ) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;

  generateTextFromTextNode: (textNodeId: string) => Promise<void>;
  generateImageFromImageGenerationNode: (
    imageGenerationNodeId: string,
  ) => Promise<void>;
  getConnectedImagesForTextNode: (textNodeId: string) => ConnectedImagePayload[];
  getConnectedImagesForImageGenerationNode: (
    imageGenerationNodeId: string,
  ) => ConnectedImagePayload[];

  setProjectName: (name: string) => void;
  newProject: (name?: string) => void;
  saveProject: () => Promise<string>;
  loadProject: (id: string) => Promise<void>;
  listProjects: () => Promise<ProjectListItem[]>;
  deleteProject: (id: string) => Promise<void>;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  projectName: "Untitled",
  nodes: [],
  edges: [],
  loading: false,
  error: null,

  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
      error: null,
    }));
  },

  addNodeAtCenter: (type, viewportCenter) => {
    const node = createNode(type, viewportCenter);
    set((state) => ({
      nodes: [...state.nodes, node],
      error: null,
    }));
    return node;
  },

  updateNodeData: (id, partial) => {
    set((state) => {
      let found = false;

      const nodes = state.nodes.map((node) => {
        if (node.id !== id) {
          return node;
        }

        found = true;

        switch (node.type) {
          case "text":
            return { ...node, data: { ...node.data, ...partial } };
          case "image_generation":
            return { ...node, data: { ...node.data, ...partial } };
          case "ai_text_result":
            return { ...node, data: { ...node.data, ...partial } };
          case "image":
            return { ...node, data: { ...node.data, ...partial } };
          case "uploaded_image":
            return { ...node, data: { ...node.data, ...partial } };
        }
      });

      if (!found) {
        console.warn(`Node "${id}" not found for updateNodeData`);
      }

      return { nodes };
    });
  },

  updateNodePosition: (id, position) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, position } : node,
      ),
    }));
  },

  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge) => edge.source !== id && edge.target !== id,
      ),
    }));
  },

  addEdge: (edge) => {
    set((state) => ({
      edges: [...state.edges, edge],
      error: null,
    }));
  },

  deleteEdge: (id) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== id),
    }));
  },

  generateTextFromTextNode: async (textNodeId) => {
    const state = get();
    const textNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "text" }> =>
        node.id === textNodeId && node.type === "text",
    );

    if (!textNode) {
      throw new Error("Text node not found");
    }

    if (!textNode.data.aiPrompt?.trim()) {
      throw new Error("Prompt is required");
    }

    const connectedImages = getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      textNodeId,
    );

    const promptSections = [
      textNode.data.text?.trim()
        ? `Current text content:\n${textNode.data.text.trim()}`
        : "",
      textNode.data.aiPrompt?.trim()
        ? `Task instructions:\n${textNode.data.aiPrompt.trim()}`
        : "",
      `Please produce a fresh variation that differs from previous results. Change the angle, wording, details, or composition. Random seed: ${crypto.randomUUID()}`,
    ].filter(Boolean);

    set((state) => ({
      error: null,
      nodes: state.nodes.map((node) =>
        node.id === textNodeId && node.type === "text"
          ? {
              ...node,
              data: {
                ...node.data,
                text: "",
                status: "generating",
                errorMessage: undefined,
              },
            }
          : node,
      ),
    }));

    try {
      const response = await fetch("/api/ai/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptSections.join("\n\n"),
          model: textNode.data.model,
          systemPrompt: TEXT_SYSTEM_PROMPT,
          temperature: 0.9,
          apiKey: readStoredTextApiKey() || undefined,
          images: connectedImages.map((image) => ({
            url: isClaudeModel(textNode.data.model)
              ? image.originalImageUrl
              : image.imageUrl,
          })),
          stream: true,
        }),
      });

      let streamedText = "";
      const result = await readTextStreamResponse(response, {
        onDelta: (delta) => {
          streamedText += delta;

          set((currentState) => ({
            nodes: currentState.nodes.map((node) =>
              node.id === textNodeId && node.type === "text"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      text: streamedText,
                      status: "generating",
                      errorMessage: undefined,
                    },
                  }
                : node,
            ),
          }));
        },
      });

      set((state) => ({
        error: null,
        nodes: setTextNodeStatus(
          state.nodes.map((node) =>
            node.id === textNodeId && node.type === "text"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    text: result.content,
                    model: result.model,
                  },
                }
              : node,
          ),
          textNodeId,
          "idle",
        ),
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((state) => ({
        error: message,
        nodes: setTextNodeStatus(state.nodes, textNodeId, "error", message),
      }));
    }
  },

  setProjectName: (name) => {
    set({ projectName: name, error: null });
  },

  getConnectedImagesForTextNode: (textNodeId) => {
    const state = get();
    return getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      textNodeId,
    );
  },

  generateImageFromImageGenerationNode: async (imageGenerationNodeId) => {
    const state = get();
    const imageGenerationNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
        node.id === imageGenerationNodeId && node.type === "image_generation",
    );

    if (!imageGenerationNode) {
      throw new Error("Image generation node not found");
    }

    if (!imageGenerationNode.data.prompt?.trim()) {
      throw new Error("Prompt is required");
    }

    const connectedImages = getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      imageGenerationNodeId,
    );
    const size = resolveImageSize(
      imageGenerationNode.data.quality,
      imageGenerationNode.data.aspectRatio,
      connectedImages,
    );
    const quality = resolveImageApiQuality(imageGenerationNode.data.detail);

    set((currentState) => ({
      error: null,
      nodes: currentState.nodes.map((node) =>
        node.id === imageGenerationNodeId && node.type === "image_generation"
          ? {
              ...node,
              data: {
                ...node.data,
                generatedImageUrl: undefined,
                generatedHostedImageUrl: undefined,
                generatedImageWidth: undefined,
                generatedImageHeight: undefined,
                generatedImageFormat: undefined,
                generatedImageSizeBytes: undefined,
                generatedModel: undefined,
                generatedAt: undefined,
                status: "generating",
                errorMessage: undefined,
              },
            }
          : node,
      ),
    }));

    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: imageGenerationNode.data.prompt.trim(),
          model: imageGenerationNode.data.model,
          size,
          quality,
          apiKey: readStoredImageApiKey() || undefined,
          images:
            connectedImages.length > 0
              ? connectedImages.map((image) => ({
                  url: image.originalImageUrl,
                  fileName: image.fileName,
                }))
              : undefined,
        }),
      });

      const json = (await response.json()) as
        | {
            ok: true;
            jobId: string;
            status: "pending";
          }
        | ApiErrorResponse;

      if (!response.ok || !("ok" in json) || json.ok === false) {
        throw new Error("error" in json ? json.error : "Request failed");
      }

      const result = await pollImageGenerationJob(json.jobId);
      const hostedImageUrl =
        result.hostedImageUrl ||
        (await persistGeneratedImage(
          result.imageUrl,
          imageGenerationNode.data.prompt.trim(),
        ).catch((error) => {
          console.warn("generated image hosting failed", error);
          return undefined;
        }));

      set((currentState) => ({
        error: null,
        nodes: currentState.nodes.map((node) =>
          node.id === imageGenerationNodeId &&
          node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  generatedImageUrl: result.imageUrl,
                  generatedHostedImageUrl: hostedImageUrl,
                  generatedImageWidth: result.width,
                  generatedImageHeight: result.height,
                  generatedImageFormat: result.format,
                  generatedImageSizeBytes: result.sizeBytes,
                  generatedModel: result.model,
                  generatedAt: nowIso(),
                  status: "idle",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
        edges: currentState.edges,
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        error: message,
        nodes: currentState.nodes.map((node) =>
          node.id === imageGenerationNodeId &&
          node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  status: "error",
                  errorMessage: message,
                },
              }
            : node,
        ),
      }));
    }
  },

  getConnectedImagesForImageGenerationNode: (imageGenerationNodeId) => {
    const state = get();
    return getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      imageGenerationNodeId,
    );
  },

  newProject: (name) => {
    set({
      projectId: null,
      projectName: name?.trim() || "Untitled",
      nodes: [],
      edges: [],
      loading: false,
      error: null,
    });
  },

  saveProject: async () => {
    set({ loading: true, error: null });

    try {
      const state = get();
      const snapshot = createSnapshot(state);

      const response = state.projectId
        ? await fetch(`/api/projects/${state.projectId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ snapshot }),
          })
        : await fetch("/api/projects", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: snapshot.name,
              snapshot,
            }),
          });

      if (state.projectId) {
        const json = await assertOkResponse<ProjectSnapshotSuccessResponse>(response);

        set({
          projectId: json.snapshot.id,
          projectName: json.snapshot.name,
          nodes: json.snapshot.nodes,
          edges: json.snapshot.edges,
          loading: false,
          error: null,
        });

        return json.snapshot.id;
      }

      const json = await assertOkResponse<ProjectMutationSuccessResponse>(response);

      set({
        projectId: json.project.id,
        projectName: json.project.name,
        loading: false,
        error: null,
      });

      return json.project.id;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  loadProject: async (id) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/projects/${id}`);
      const json = await assertOkResponse<ProjectSnapshotSuccessResponse>(response);

      set({
        projectId: json.snapshot.id,
        projectName: json.snapshot.name,
        nodes: json.snapshot.nodes,
        edges: json.snapshot.edges,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  listProjects: async () => {
    set({ error: null });

    try {
      const response = await fetch("/api/projects");
      const json = await assertOkResponse<ProjectsListSuccessResponse>(response);

      return json.projects.map((project) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      await assertOkResponse<{ ok: true }>(response);

      if (get().projectId === id) {
        get().newProject();
      } else {
        set({ loading: false, error: null });
      }
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },
}));
