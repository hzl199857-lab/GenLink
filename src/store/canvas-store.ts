"use client";

import { create } from "zustand";

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

type ProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
};

type ApiErrorResponse = {
  ok: false;
  error: string;
};

export const CANVAS_TEXT_API_KEY_STORAGE_KEY = "genlink.vibeTextApiKey";
function readStoredApiKey(storageKey: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(storageKey)?.trim() ?? "";
}

function readStoredTextApiKey(): string {
  return readStoredApiKey(CANVAS_TEXT_API_KEY_STORAGE_KEY);
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

async function assertOkResponse<TSuccess extends { ok: true }>(
  response: Response,
): Promise<TSuccess> {
  const json = (await response.json()) as TSuccess | ApiErrorResponse;

  if (!response.ok || ("ok" in json && json.ok === false)) {
    throw new Error("error" in json ? json.error : "Request failed");
  }

  return json as TSuccess;
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

function getConnectedImagesForTextNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  textNodeId: string,
): ConnectedImagePayload[] {
  const connectedSourceIds = edges
    .filter((edge) => edge.target === textNodeId)
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
  getConnectedImagesForTextNode: (textNodeId: string) => ConnectedImagePayload[];

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

    if (!readStoredTextApiKey()) {
      throw new Error("Please set the Text API key first");
    }

    const connectedImages = getConnectedImagesForTextNode(
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
          apiKey: readStoredTextApiKey(),
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
    return getConnectedImagesForTextNode(state.nodes, state.edges, textNodeId);
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
