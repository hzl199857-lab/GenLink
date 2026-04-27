// GenLink canvas domain types shared by store, API, and node rendering.

export type NodeType = "text" | "prompt" | "ai_text_result" | "image";

export interface BaseCanvasNode<
  TType extends NodeType = NodeType,
  TData = unknown,
> {
  id: string;
  type: TType;
  position: {
    x: number;
    y: number;
  };
  data: TData;
}

export interface TextNodeData {
  text: string;
  title?: string;
}

export interface PromptNodeData {
  prompt: string;
  mode: "text" | "image";
  model?: string;
  status: "idle" | "generating" | "error";
  errorMessage?: string;
}

export interface AITextResultNodeData {
  content: string;
  model: string;
  tokens?: number;
  generatedAt: string;
  sourcePromptNodeId?: string;
}

export interface ImageNodeData {
  imageUrl: string;
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  generatedAt: string;
  sourcePromptNodeId?: string;
}

export type CanvasNodeData =
  | { type: "text"; data: TextNodeData }
  | { type: "prompt"; data: PromptNodeData }
  | { type: "ai_text_result"; data: AITextResultNodeData }
  | { type: "image"; data: ImageNodeData };

export type CanvasNode =
  | BaseCanvasNode<"text", TextNodeData>
  | BaseCanvasNode<"prompt", PromptNodeData>
  | BaseCanvasNode<"ai_text_result", AITextResultNodeData>
  | BaseCanvasNode<"image", ImageNodeData>;

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  createdAt: string;
  updatedAt: string;
}
