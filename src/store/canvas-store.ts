"use client";

import { create } from "zustand";

import type {
  AITextResultNodeData,
  CanvasEdge,
  CanvasNode,
  ImageNodeData,
  NodeType,
  ProjectSnapshot,
  PromptNodeData,
  TextNodeData,
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

type AiTextSuccessResponse = {
  ok: true;
  result: {
    content: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

type AiImageSuccessResponse = {
  ok: true;
  result: {
    imageUrl: string;
    model: string;
    width: number;
    height: number;
  };
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

function nowIso(): string {
  return new Date().toISOString();
}

function createTextNodeData(): TextNodeData {
  return { text: "" };
}

function createPromptNodeData(): PromptNodeData {
  return {
    prompt: "",
    mode: "text",
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

function createNode(type: NodeType, position: { x: number; y: number }): CanvasNode {
  switch (type) {
    case "text":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createTextNodeData(),
      };
    case "prompt":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createPromptNodeData(),
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

function setPromptNodeStatus(
  nodes: CanvasNode[],
  promptNodeId: string,
  status: PromptNodeData["status"],
  errorMessage?: string,
): CanvasNode[] {
  return nodes.map((node) =>
    node.id === promptNodeId && node.type === "prompt"
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

  generateTextFromPrompt: (promptNodeId: string) => Promise<void>;
  generateImageFromPrompt: (promptNodeId: string) => Promise<void>;

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
          case "prompt":
            return { ...node, data: { ...node.data, ...partial } };
          case "ai_text_result":
            return { ...node, data: { ...node.data, ...partial } };
          case "image":
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

  generateTextFromPrompt: async (promptNodeId) => {
    const promptNode = get().nodes.find(
      (node): node is Extract<CanvasNode, { type: "prompt" }> =>
        node.id === promptNodeId && node.type === "prompt",
    );

    if (!promptNode) {
      throw new Error("Prompt node not found");
    }

    if (promptNode.data.mode !== "text") {
      throw new Error("Prompt node mode is not text");
    }

    set((state) => ({
      error: null,
      nodes: setPromptNodeStatus(state.nodes, promptNodeId, "generating"),
    }));

    try {
      const response = await fetch("/api/ai/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptNode.data.prompt,
          model: promptNode.data.model,
        }),
      });

      const json = await assertOkResponse<AiTextSuccessResponse>(response);
      const resultNodeId = crypto.randomUUID();
      const generatedAt = nowIso();

      const resultNode: CanvasNode = {
        id: resultNodeId,
        type: "ai_text_result",
        position: {
          x: promptNode.position.x + 380,
          y: promptNode.position.y,
        },
        data: {
          content: json.result.content,
          model: json.result.model,
          tokens: json.result.totalTokens,
          generatedAt,
          sourcePromptNodeId: promptNodeId,
        },
      };

      const edge: CanvasEdge = {
        id: crypto.randomUUID(),
        source: promptNodeId,
        target: resultNodeId,
      };

      set((state) => ({
        error: null,
        nodes: setPromptNodeStatus(state.nodes, promptNodeId, "idle").concat(
          resultNode,
        ),
        edges: [...state.edges, edge],
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((state) => ({
        error: message,
        nodes: setPromptNodeStatus(state.nodes, promptNodeId, "error", message),
      }));
    }
  },

  generateImageFromPrompt: async (promptNodeId) => {
    const promptNode = get().nodes.find(
      (node): node is Extract<CanvasNode, { type: "prompt" }> =>
        node.id === promptNodeId && node.type === "prompt",
    );

    if (!promptNode) {
      throw new Error("Prompt node not found");
    }

    if (promptNode.data.mode !== "image") {
      throw new Error("Prompt node mode is not image");
    }

    set((state) => ({
      error: null,
      nodes: setPromptNodeStatus(state.nodes, promptNodeId, "generating"),
    }));

    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptNode.data.prompt,
          model: promptNode.data.model,
          size: "1024x1024",
        }),
      });

      const json = await assertOkResponse<AiImageSuccessResponse>(response);
      const resultNodeId = crypto.randomUUID();
      const generatedAt = nowIso();

      const resultNode: CanvasNode = {
        id: resultNodeId,
        type: "image",
        position: {
          x: promptNode.position.x + 380,
          y: promptNode.position.y,
        },
        data: {
          imageUrl: json.result.imageUrl,
          prompt: promptNode.data.prompt,
          model: json.result.model,
          width: json.result.width,
          height: json.result.height,
          generatedAt,
          sourcePromptNodeId: promptNodeId,
        },
      };

      const edge: CanvasEdge = {
        id: crypto.randomUUID(),
        source: promptNodeId,
        target: resultNodeId,
      };

      set((state) => ({
        error: null,
        nodes: setPromptNodeStatus(state.nodes, promptNodeId, "idle").concat(
          resultNode,
        ),
        edges: [...state.edges, edge],
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((state) => ({
        error: message,
        nodes: setPromptNodeStatus(state.nodes, promptNodeId, "error", message),
      }));
    }
  },

  setProjectName: (name) => {
    set({ projectName: name, error: null });
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
