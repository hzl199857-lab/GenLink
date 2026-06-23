// GenLink canvas domain types shared by store, API, and node rendering.

export type NodeType =
  | "text"
  | "storyboard_script"
  | "storyboard_grid"
  | "image_generation"
  | "video_generation"
  | "video_upscale"
  | "video"
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

export type StoryboardRow = {
  "镜号": string;
  "时长": string;
  "景别": string;
  "场景": string;
  "画面描述": string;
  "角色": string;
  "角色描述": string;
  "角色动作": string;
  "情绪": string;
  "角色图": string;
  "参考": string;
  "图片提示词": string;
  "视频提示词": string;
  "对白": string;
  "音效": string;
};

export interface StoryboardReferenceImage {
  label: string;
  url: string;
  previewUrl?: string;
  sourceNodeId: string;
  alt?: string;
}

export interface StoryboardScriptNodeData {
  title?: string;
  prompt: string;
  rows: StoryboardRow[];
  rawJson?: string;
  cardWidth?: number;
  cardHeight?: number;
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
  viewMode: "list" | "card";
  focusMode: "imagePrompt" | "videoPrompt";
  provider?: "vibe" | "fucheers" | "comfly" | "zhenzhen" | "runninghub" | "grsai";
  model?: string;
  referenceImages?: StoryboardReferenceImage[];
}

export type StoryboardGridAspectRatio = "16:9" | "9:16" | "3:4" | "4:3" | "1:1";
export type StoryboardGridSize = "2x2" | "3x3" | "4x4" | "5x5";

export interface StoryboardGridCellImage {
  id: string;
  imageUrl: string;
  hostedImageUrl?: string;
  previewUrl?: string;
  semanticImageUrl?: string;
  fileName?: string;
  title?: string;
  width?: number;
  height?: number;
  sourceNodeId?: string;
}

export interface StoryboardGridNodeData {
  title?: string;
  aspectRatio: StoryboardGridAspectRatio;
  grid: StoryboardGridSize;
  cells: Array<StoryboardGridCellImage | null>;
  isEditing?: boolean;
  isCollapsed?: boolean;
  outputImageUrl?: string;
  outputHostedImageUrl?: string;
  outputFileName?: string;
  outputWidth?: number;
  outputHeight?: number;
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

export interface ImageAnnotation {
  id: string;
  kind?: "text" | "rect" | "path" | "number";
  name: string;
  number?: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points?: Array<{ x: number; y: number }>;
  color?: string;
  strokeWidth?: number;
  fontSize?: number;
  rotation?: number;
  visible?: boolean;
  createdAt: string;
}

export interface ImageGenerationNodeData {
  title?: string;
  prompt?: string;
  effectivePromptOverride?: string;
  agentLogicalId?: string;
  agentWorkflowId?: string;
  agentNodeType?: string;
  generationStatus?: "pending" | "running" | "finished" | "failed";
  generationErrorCode?: string;
  generationErrorMessage?: string;
  generationRetryable?: boolean;
  generationLastRunId?: string;
  generationUpdatedAt?: string;
  provider?: "vibe" | "fucheers" | "comfly" | "zhenzhen" | "runninghub" | "grsai";
  model?: string;
  runningHubChannel?: "official" | "low-cost";
  runningHubWorkflowId?: string;
  cameraAngle?: {
    rotation: number;
    pitch: number;
    scale: number;
  };
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
    previewUrl?: string;
    semanticImageUrl?: string;
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
  annotations?: ImageAnnotation[];
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

export type ImageGenerationRunOptions = {
  aspectRatio?: string;
  quality?: string;
};

export type VideoGenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "all-reference"
  | "first-last-frame";

export type VideoGenerationProvider = "comfly";

export interface VideoGenerationMediaReference {
  id: string;
  url: string;
  hostedUrl?: string;
  previewUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface VideoGenerationNodeData {
  title?: string;
  prompt?: string;
  provider?: VideoGenerationProvider;
  model?: string;
  mode?: VideoGenerationMode;
  ratio?: string;
  resolution?: "480p" | "720p" | "1080p";
  duration?: number;
  seed?: number;
  camerafixed?: boolean;
  watermark?: boolean;
  returnLastFrame?: boolean;
  generateAudio?: boolean;
  referenceImages?: VideoGenerationMediaReference[];
  referenceVideos?: VideoGenerationMediaReference[];
  referenceAudio?: VideoGenerationMediaReference[];
  taskId?: string;
  progress?: string;
  videoUrl?: string;
  hostedVideoUrl?: string;
  generatedOutputFileName?: string;
  lastFrameUrl?: string;
  generatedModel?: string;
  generatedAt?: string;
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

export interface VideoUpscaleNodeData {
  title?: string;
  targetResolution?: "720p" | "1080p" | "4k";
  targetFps?: "30" | "60";
  instanceType?: "default" | "plus";
  taskId?: string;
  progress?: string;
  videoUrl?: string;
  hostedVideoUrl?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  generatedOutputFileName?: string;
  generatedAt?: string;
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

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
  previewUrl?: string;
  semanticImageUrl?: string;
  fileName?: string;
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  sizeBytes?: number;
  generatedAt: string;
  status?: 'idle' | 'generating' | 'error';
  statusMessage?: string;
  errorMessage?: string;
  sourcePromptNodeId?: string;
  sourceImageNodeId?: string;
  generatedOutputFileName?: string;
  annotations?: ImageAnnotation[];
  cameraAngle?: {
    rotation: number;
    pitch: number;
    scale: number;
  };
}

export interface UploadedImageNodeData {
  title?: string;
  imageUrl: string;
  hostedImageUrl?: string;
  previewUrl?: string;
  semanticImageUrl?: string;
  fileName?: string;
  outputFileName?: string;
  width: number;
  height: number;
  displayWidth?: number;
  displayHeight?: number;
  sizeBytes?: number;
  annotations?: ImageAnnotation[];
}

export interface VideoNodeData {
  title?: string;
  videoUrl: string;
  hostedVideoUrl?: string;
  previewUrl?: string;
  fileName?: string;
  outputFileName?: string;
  width: number;
  height: number;
  displayWidth?: number;
  displayHeight?: number;
  sizeBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
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
  | { type: "storyboard_script"; data: StoryboardScriptNodeData }
  | { type: "storyboard_grid"; data: StoryboardGridNodeData }
  | { type: "image_generation"; data: ImageGenerationNodeData }
  | { type: "video_generation"; data: VideoGenerationNodeData }
  | { type: "video_upscale"; data: VideoUpscaleNodeData }
  | { type: "video"; data: VideoNodeData }
  | { type: "ai_text_result"; data: AITextResultNodeData }
  | { type: "image"; data: ImageNodeData }
  | { type: "uploaded_image"; data: UploadedImageNodeData }
  | { type: "panorama-360"; data: Panorama360NodeData };

export type CanvasNode =
  | BaseCanvasNode<"text", TextNodeData>
  | BaseCanvasNode<"storyboard_script", StoryboardScriptNodeData>
  | BaseCanvasNode<"storyboard_grid", StoryboardGridNodeData>
  | BaseCanvasNode<"image_generation", ImageGenerationNodeData>
  | BaseCanvasNode<"video_generation", VideoGenerationNodeData>
  | BaseCanvasNode<"video_upscale", VideoUpscaleNodeData>
  | BaseCanvasNode<"video", VideoNodeData>
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
  thumbnailFileName?: string;
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

interface BaseProjectOutputHistoryItem {
  id: string;
  sourceKey?: string;
  fileName: string;
  previewUrl: string;
  createdAt: string;
  modifiedAt: string;
  mimeType?: string;
  sizeBytes?: number;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
}

export type ProjectOutputHistoryItem =
  | (BaseProjectOutputHistoryItem & {
      kind: "image";
      nodeData?: ImageGenerationNodeData;
    })
  | (BaseProjectOutputHistoryItem & {
      kind: "video";
      nodeData?: VideoGenerationNodeData | VideoUpscaleNodeData;
    });
