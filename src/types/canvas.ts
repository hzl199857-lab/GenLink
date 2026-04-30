// GenLink canvas domain types shared by store, API, and node rendering.

export type NodeType = "text" | "ai_text_result" | "image" | "uploaded_image";

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
  aiPrompt?: string;
  model?: string;
  status?: "idle" | "generating" | "error";
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
  hostedImageUrl?: string;
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  generatedAt: string;
  sourcePromptNodeId?: string;
}

export interface UploadedImageNodeData {
  imageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  width: number;
  height: number;
}

export type CanvasNodeData =
  | { type: "text"; data: TextNodeData }
  | { type: "ai_text_result"; data: AITextResultNodeData }
  | { type: "image"; data: ImageNodeData }
  | { type: "uploaded_image"; data: UploadedImageNodeData };

export type CanvasNode =
  | BaseCanvasNode<"text", TextNodeData>
  | BaseCanvasNode<"ai_text_result", AITextResultNodeData>
  | BaseCanvasNode<"image", ImageNodeData>
  | BaseCanvasNode<"uploaded_image", UploadedImageNodeData>;

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
