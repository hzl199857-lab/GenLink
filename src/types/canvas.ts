// GenLink canvas domain types shared by store, API, and node rendering.

export type NodeType =
  | "text"
  | "image_generation"
  | "ai_text_result"
  | "image"
  | "uploaded_image"
  | "panorama-360";

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
  backgroundColor?: string;
  aiPrompt?: string;
  provider?: "vibe" | "fucheers" | "comfly" | "zhenzhen" | "runninghub" | "grsai";
  model?: string;
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

export interface ImageGenerationResultItem {
  status: "completed" | "error";
  imageUrl?: string;
  hostedImageUrl?: string;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
  generatedAt: string;
  errorMessage?: string;
}

export interface ImageGenerationNodeData {
  title?: string;
  prompt?: string;
  effectivePromptOverride?: string;
  provider?: "vibe" | "fucheers" | "comfly" | "zhenzhen" | "runninghub" | "grsai";
  model?: string;
  runningHubChannel?: "official" | "low-cost";
  generatedModel?: string;
  aspectRatio?: string;
  quality?: string;
  detail?: string;
  outputFormat?: string;
  moderation?: string;
  parallelCount?: 1 | 2 | 4;
  referenceImageUrl?: string;
  referenceImages?: Array<{
    id: string;
    imageUrl: string;
    hostedImageUrl?: string;
    fileName?: string;
    width?: number;
    height?: number;
    sizeBytes?: number;
  }>;
  generatedImageUrl?: string;
  generatedHostedImageUrl?: string;
  generatedOutputFileName?: string;
  generatedImageWidth?: number;
  generatedImageHeight?: number;
  generatedImageFormat?: string;
  generatedImageSizeBytes?: number;
  generatedAt?: string;
  generationResults?: ImageGenerationResultItem[];
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

export type ImageGenerationRunOptions = {
  aspectRatio?: string;
  quality?: string;
};

export interface AITextResultNodeData {
  title?: string;
  content: string;
  model: string;
  tokens?: number;
  generatedAt: string;
  sourcePromptNodeId?: string;
}

export interface ImageNodeData {
  title?: string;
  imageUrl: string;
  hostedImageUrl?: string;
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  generatedAt: string;
  sourcePromptNodeId?: string;
}

export interface UploadedImageNodeData {
  title?: string;
  imageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  width: number;
  height: number;
  displayWidth?: number;
  displayHeight?: number;
  sizeBytes?: number;
}

export interface Panorama360ViewState {
  yaw: number;
  pitch: number;
  fov: number;
}

export interface Panorama360NodeData {
  title?: string;
  panorama360Node: {
    version: 1;
    mode: "panorama";
    viewport: {
      activeView: "default";
      panoramaView: Panorama360ViewState;
    };
    panorama: {
      sourceSignature?: string;
      isLoaded: boolean;
      error: string | null;
      generatedImageUrl?: string;
      generatedHostedImageUrl?: string;
      generatedOutputFileName?: string;
      generatedImageWidth?: number;
      generatedImageHeight?: number;
      generatedImageFormat?: string;
      generatedImageSizeBytes?: number;
      generatedModel?: string;
      generatedAt?: string;
      generationStatus?: "idle" | "generating" | "error";
      generationErrorMessage?: string;
    };
    ui: {
      mouseTool: "navigate";
      isEditing: boolean;
    };
  };
}

export type CanvasNodeData =
  | { type: "text"; data: TextNodeData }
  | { type: "image_generation"; data: ImageGenerationNodeData }
  | { type: "ai_text_result"; data: AITextResultNodeData }
  | { type: "image"; data: ImageNodeData }
  | { type: "uploaded_image"; data: UploadedImageNodeData }
  | { type: "panorama-360"; data: Panorama360NodeData };

export type CanvasNode =
  | BaseCanvasNode<"text", TextNodeData>
  | BaseCanvasNode<"image_generation", ImageGenerationNodeData>
  | BaseCanvasNode<"ai_text_result", AITextResultNodeData>
  | BaseCanvasNode<"image", ImageNodeData>
  | BaseCanvasNode<"uploaded_image", UploadedImageNodeData>
  | BaseCanvasNode<"panorama-360", Panorama360NodeData>;

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NodeGroup {
  id: string;
  name?: string;
  backgroundColor?: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MaterialLibraryCategory =
  | "人物"
  | "场景"
  | "物品"
  | "风格"
  | "其他";

export interface MaterialLibraryItem {
  id: string;
  name: string;
  category: MaterialLibraryCategory;
  imageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  outputFileName?: string;
  sourceNodeType?: "image_generation" | "image" | "uploaded_image";
  width?: number;
  height?: number;
  sizeBytes?: number;
  format?: string;
  createdAt: string;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: NodeGroup[];
  materials?: MaterialLibraryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ImageHistoryItem {
  id: string;
  imageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
  generatedAt: string;
  nodeData: ImageGenerationNodeData;
}

export interface ImageHistoryListItem {
  id: string;
  imageUrl?: string;
  hostedImageUrl?: string;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
  generatedAt: string;
}

export interface ProjectOutputHistoryItem {
  id: string;
  sourceKey?: string;
  fileName: string;
  kind: "image" | "video";
  previewUrl: string;
  createdAt: string;
  modifiedAt: string;
  mimeType?: string;
  sizeBytes?: number;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  nodeData?: ImageGenerationNodeData;
}
