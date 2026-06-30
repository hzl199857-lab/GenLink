import type {
  AITextResultNodeData,
  AudioGenerationNodeData,
  AudioGenerationMode,
  AudioGenerationModel,
  AudioGenerationProvider,
  AudioGenerationVocalGender,
  AudioNodeData,
  CanvasEdge,
  CanvasNode,
  ImageGenerationResultItem,
  ImageGenerationNodeData,
  ImageNodeData,
  NodeType,
  Panorama360NodeData,
  ProjectSnapshot,
  StoryboardGridNodeData,
  StoryboardReferenceImage,
  StoryboardScriptNodeData,
  StoryboardGridAspectRatio,
  StoryboardGridSize,
  TextNodeData,
  UploadedImageNodeData,
  VideoNodeData,
  VideoGenerationMediaReference,
  VideoGenerationMode,
  VideoGenerationNodeData,
  VideoUpscaleNodeData,
} from "@/types/canvas";
import {
  STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
  STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
  normalizeStoryboardCardSize,
} from "./storyboard/layout";
import { normalizeTextNodeCardSize } from "./text-node/layout";
import {
  isStoryboardRecord,
  normalizeStoryboardRow,
} from "./storyboard/normalize";

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

type StoryboardReferenceImageRecord = Record<string, unknown> & {
  label: string;
  url: string;
  sourceNodeId: string;
};

const STORYBOARD_GRID_ASPECT_RATIOS = new Set<StoryboardGridAspectRatio>([
  "16:9",
  "9:16",
  "3:4",
  "4:3",
  "1:1",
]);

const STORYBOARD_GRID_SIZES = new Set<StoryboardGridSize>([
  "2x2",
  "3x3",
  "4x4",
  "5x5",
]);

function isNodeType(value: string): value is NodeType {
  return (
    value === "text" ||
    value === "storyboard_script" ||
    value === "storyboard_grid" ||
    value === "image_generation" ||
    value === "video_generation" ||
    value === "audio_generation" ||
    value === "video_upscale" ||
    value === "video" ||
    value === "audio" ||
    value === "ai_text_result" ||
    value === "image" ||
    value === "uploaded_image" ||
    value === "panorama-360"
  );
}

function normalizeVideoUpscaleNodeData(value: unknown): VideoUpscaleNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : "视频超清",
      targetResolution:
        record.targetResolution === "720p" ||
        record.targetResolution === "1080p" ||
        record.targetResolution === "4k"
          ? record.targetResolution
          : "1080p",
      targetFps:
        record.targetFps === "60"
          ? "60"
          : "30",
      instanceType:
        record.instanceType === "plus"
          ? "plus"
          : "default",
      taskId: typeof record.taskId === "string" ? record.taskId : undefined,
      progress: typeof record.progress === "string" ? record.progress : undefined,
      videoUrl: typeof record.videoUrl === "string" ? record.videoUrl : undefined,
      hostedVideoUrl:
        typeof record.hostedVideoUrl === "string" ? record.hostedVideoUrl : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      sizeBytes:
        typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      generatedOutputFileName:
        typeof record.generatedOutputFileName === "string"
          ? record.generatedOutputFileName
          : undefined,
      generatedAt:
        typeof record.generatedAt === "string" ? record.generatedAt : undefined,
      status:
        record.status === "generating" || record.status === "error"
          ? record.status
          : "idle",
      errorMessage:
        typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    };
  }

  return {
    title: "视频超清",
    targetResolution: "1080p",
    targetFps: "30",
    instanceType: "default",
    status: "idle",
  };
}

function normalizeAudioGenerationProvider(value: unknown): AudioGenerationProvider {
  if (value === "runninghub") {
    return "runninghub";
  }

  return value === "zhenzhen" ? "zhenzhen" : "comfly";
}

function normalizeAudioGenerationModel(value: unknown): AudioGenerationModel {
  switch (value) {
    case "runninghub-voice-clone":
    case "suno-v5":
    case "suno-v4.5-plus":
      return value;
    default:
      return "suno-v5.5";
  }
}

function normalizeAudioGenerationMode(value: unknown): AudioGenerationMode {
  return value === "custom" ? "custom" : "inspiration";
}

function normalizeAudioGenerationVocalGender(value: unknown): AudioGenerationVocalGender {
  return value === "f" || value === "m" ? value : "auto";
}

function normalizeAudioGenerationNodeData(value: unknown): AudioGenerationNodeData {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const songTitleEdited = record.songTitleEdited === true;
  const legacySongTitle = typeof record.songTitle === "string" ? record.songTitle : "";

  return {
    title: typeof record.title === "string" ? record.title : "Audio",
    songTitle: songTitleEdited ? legacySongTitle : "",
    songTitleEdited,
    generatedAudioTitle:
      typeof record.generatedAudioTitle === "string"
        ? record.generatedAudioTitle
        : songTitleEdited
          ? ""
          : legacySongTitle,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    provider: normalizeAudioGenerationProvider(record.provider),
    model: normalizeAudioGenerationModel(record.model),
    mode: normalizeAudioGenerationMode(record.mode),
    runningHubWorkflowId:
      typeof record.runningHubWorkflowId === "string"
        ? record.runningHubWorkflowId
        : "",
    instanceType: record.instanceType === "plus" ? "plus" : "default",
    taskType:
      record.taskType === "voiceover" ||
      record.taskType === "music" ||
      record.taskType === "sound-effect"
        ? record.taskType
        : "music",
    duration: typeof record.duration === "number" ? record.duration : 10,
    style: typeof record.style === "string" ? record.style : "",
    voice: typeof record.voice === "string" ? record.voice : "",
    instrumental: record.instrumental === true,
    negativeTags: typeof record.negativeTags === "string" ? record.negativeTags : "",
    vocalGender: normalizeAudioGenerationVocalGender(record.vocalGender),
    referenceAudio: normalizeMediaReferences(record.referenceAudio),
    taskId: typeof record.taskId === "string" ? record.taskId : undefined,
    progress: typeof record.progress === "string" ? record.progress : undefined,
    audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : undefined,
    hostedAudioUrl:
      typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
    generatedOutputFileName:
      typeof record.generatedOutputFileName === "string"
        ? record.generatedOutputFileName
        : undefined,
    generatedModel:
      typeof record.generatedModel === "string" ? record.generatedModel : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
    durationSeconds:
      typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    status:
      record.status === "generating" || record.status === "error"
        ? record.status
        : "idle",
    errorMessage:
      typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

function normalizeVideoGenerationMode(value: unknown): VideoGenerationMode {
  switch (value) {
    case "text-to-video":
    case "image-to-video":
    case "first-last-frame":
    case "all-reference":
      return value;
    default:
      return "all-reference";
  }
}

function normalizeMediaReferences(value: unknown): VideoGenerationMediaReference[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references = value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
    )
    .map((item, index) => ({
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id
          : `reference-${index}`,
      url: typeof item.url === "string" ? item.url : "",
      hostedUrl: typeof item.hostedUrl === "string" ? item.hostedUrl : undefined,
      previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : undefined,
      fileName: typeof item.fileName === "string" ? item.fileName : undefined,
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : undefined,
      width: typeof item.width === "number" ? item.width : undefined,
      height: typeof item.height === "number" ? item.height : undefined,
      durationSeconds:
        typeof item.durationSeconds === "number" ? item.durationSeconds : undefined,
    }))
    .filter((item) => item.url.trim());

  return references.length ? references : undefined;
}

function normalizeVideoGenerationNodeData(value: unknown): VideoGenerationNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : "Video",
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      provider: "comfly",
      model:
        typeof record.model === "string"
          ? record.model
          : "doubao-seedance-2-0-260128",
      mode: normalizeVideoGenerationMode(record.mode),
      ratio: typeof record.ratio === "string" ? record.ratio : "16:9",
      resolution:
        record.resolution === "480p" ||
        record.resolution === "720p" ||
        record.resolution === "1080p"
          ? record.resolution
          : "720p",
      duration: typeof record.duration === "number" ? record.duration : 5,
      seed: typeof record.seed === "number" ? record.seed : undefined,
      camerafixed: record.camerafixed === true,
      watermark: record.watermark === true,
      returnLastFrame: record.returnLastFrame === true,
      generateAudio: record.generateAudio === true,
      referenceImages: normalizeMediaReferences(record.referenceImages),
      referenceVideos: normalizeMediaReferences(record.referenceVideos),
      referenceAudio: normalizeMediaReferences(record.referenceAudio),
      taskId: typeof record.taskId === "string" ? record.taskId : undefined,
      progress: typeof record.progress === "string" ? record.progress : undefined,
      videoUrl: typeof record.videoUrl === "string" ? record.videoUrl : undefined,
      hostedVideoUrl:
        typeof record.hostedVideoUrl === "string" ? record.hostedVideoUrl : undefined,
      generatedOutputFileName:
        typeof record.generatedOutputFileName === "string"
          ? record.generatedOutputFileName
          : undefined,
      lastFrameUrl:
        typeof record.lastFrameUrl === "string" ? record.lastFrameUrl : undefined,
      generatedModel:
        typeof record.generatedModel === "string" ? record.generatedModel : undefined,
      generatedAt:
        typeof record.generatedAt === "string" ? record.generatedAt : undefined,
      status:
        record.status === "generating" || record.status === "error"
          ? record.status
          : "idle",
      errorMessage:
        typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    };
  }

  return {
    title: "Video",
    prompt: "",
    provider: "comfly",
    model: "doubao-seedance-2-0-260128",
    mode: "all-reference",
    ratio: "16:9",
    resolution: "720p",
    duration: 5,
    status: "idle",
  };
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
    const cardSize = normalizeTextNodeCardSize(record.cardWidth, record.cardHeight);

    return {
      text: typeof record.text === "string" ? record.text : "",
      title: typeof record.title === "string" ? record.title : undefined,
      cardWidth: cardSize.width,
      cardHeight: cardSize.height,
    };
  }

  const cardSize = normalizeTextNodeCardSize(undefined, undefined);
  return {
    text: "",
    cardWidth: cardSize.width,
    cardHeight: cardSize.height,
  };
}

function normalizeStoryboardReferenceImages(value: unknown): StoryboardReferenceImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is StoryboardReferenceImageRecord =>
    isStoryboardRecord(item) &&
    typeof item.label === "string" &&
    typeof item.url === "string" &&
    typeof item.sourceNodeId === "string",
  ).map((item) => ({
    label: item.label.trim(),
    url: item.url.trim(),
    previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : undefined,
    sourceNodeId: item.sourceNodeId.trim(),
    alt: typeof item.alt === "string" ? item.alt : undefined,
  })).filter((item) => item.label && item.url && item.sourceNodeId);
}

function normalizeStoryboardScriptNodeData(value: unknown): StoryboardScriptNodeData {
  const record = isStoryboardRecord(value) ? value : {};
  const cardSize = normalizeStoryboardCardSize(record.cardWidth, record.cardHeight);

  return {
    title: typeof record.title === "string" ? record.title : "Storyboard script",
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    rows: Array.isArray(record.rows)
      ? record.rows.map(normalizeStoryboardRow)
      : [],
    rawJson: typeof record.rawJson === "string" ? record.rawJson : undefined,
    cardWidth: cardSize.width || STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
    cardHeight: cardSize.height || STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
    status:
      record.status === "generating" || record.status === "error" || record.status === "idle"
        ? record.status
        : "idle",
    errorMessage:
      typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    viewMode: record.viewMode === "card" || record.viewMode === "list"
      ? record.viewMode
      : "list",
    focusMode: record.focusMode === "videoPrompt" || record.focusMode === "imagePrompt"
      ? record.focusMode
      : "imagePrompt",
    provider:
      record.provider === "vibe" ||
      record.provider === "fucheers" ||
      record.provider === "comfly" ||
      record.provider === "zhenzhen" ||
      record.provider === "runninghub" ||
      record.provider === "grsai"
        ? record.provider
        : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    referenceImages: normalizeStoryboardReferenceImages(record.referenceImages),
  };
}

function normalizeStoryboardGridNodeData(value: unknown): StoryboardGridNodeData {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const aspectRatio = typeof record.aspectRatio === "string" &&
    STORYBOARD_GRID_ASPECT_RATIOS.has(record.aspectRatio as StoryboardGridAspectRatio)
      ? record.aspectRatio as StoryboardGridAspectRatio
      : "16:9";
  const grid = typeof record.grid === "string" &&
    STORYBOARD_GRID_SIZES.has(record.grid as StoryboardGridSize)
      ? record.grid as StoryboardGridSize
      : "3x3";
  const [columns, rows] = grid.split("x").map((item) => Number(item));
  const cellCount = (columns || 3) * (rows || 3);
  const sourceCells = Array.isArray(record.cells) ? record.cells : [];
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const cell = sourceCells[index];

    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      return null;
    }

    const cellRecord = cell as Record<string, unknown>;
    const imageUrl = typeof cellRecord.imageUrl === "string" ? cellRecord.imageUrl : "";

    if (!imageUrl) {
      return null;
    }

    return {
      id: typeof cellRecord.id === "string" ? cellRecord.id : `${index}`,
      imageUrl,
      hostedImageUrl:
        typeof cellRecord.hostedImageUrl === "string" ? cellRecord.hostedImageUrl : undefined,
      previewUrl:
        typeof cellRecord.previewUrl === "string" ? cellRecord.previewUrl : undefined,
      semanticImageUrl:
        typeof cellRecord.semanticImageUrl === "string" ? cellRecord.semanticImageUrl : undefined,
      fileName:
        typeof cellRecord.fileName === "string" ? cellRecord.fileName : undefined,
      title:
        typeof cellRecord.title === "string" ? cellRecord.title : undefined,
      width:
        typeof cellRecord.width === "number" ? cellRecord.width : undefined,
      height:
        typeof cellRecord.height === "number" ? cellRecord.height : undefined,
      sourceNodeId:
        typeof cellRecord.sourceNodeId === "string" ? cellRecord.sourceNodeId : undefined,
    };
  });

  return {
    title: typeof record.title === "string" ? record.title : "分镜格子",
    aspectRatio,
    grid,
    cells,
    isEditing: Boolean(record.isEditing),
    isCollapsed: Boolean(record.isCollapsed),
    outputImageUrl:
      typeof record.outputImageUrl === "string" ? record.outputImageUrl : undefined,
    outputHostedImageUrl:
      typeof record.outputHostedImageUrl === "string" ? record.outputHostedImageUrl : undefined,
    outputFileName:
      typeof record.outputFileName === "string" ? record.outputFileName : undefined,
    outputWidth:
      typeof record.outputWidth === "number" ? record.outputWidth : undefined,
    outputHeight:
      typeof record.outputHeight === "number" ? record.outputHeight : undefined,
    status:
      record.status === "generating" || record.status === "error" || record.status === "idle"
        ? record.status
        : "idle",
    errorMessage:
      typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
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
      provider:
        record.provider === "vibe" ||
        record.provider === "fucheers" ||
        record.provider === "comfly" ||
        record.provider === "zhenzhen" ||
        record.provider === "runninghub" ||
        record.provider === "grsai"
          ? record.provider
          : undefined,
      outputFormat:
        typeof record.outputFormat === "string" ? record.outputFormat : undefined,
      moderation:
        typeof record.moderation === "string" ? record.moderation : undefined,
      runningHubChannel:
        record.runningHubChannel === "official" ||
        record.runningHubChannel === "low-cost"
          ? record.runningHubChannel
          : undefined,
      runningHubWorkflowId:
        typeof record.runningHubWorkflowId === "string"
          ? record.runningHubWorkflowId
          : undefined,
      effectivePromptOverride:
        typeof record.effectivePromptOverride === "string"
          ? record.effectivePromptOverride
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
      previewUrl:
        typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      semanticImageUrl:
        typeof record.semanticImageUrl === "string"
          ? record.semanticImageUrl
          : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: typeof record.model === "string" ? record.model : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      displayWidth:
        typeof record.displayWidth === "number" ? record.displayWidth : undefined,
      displayHeight:
        typeof record.displayHeight === "number" ? record.displayHeight : undefined,
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
      sourceImageNodeId:
        typeof record.sourceImageNodeId === "string"
          ? record.sourceImageNodeId
          : undefined,
      generatedOutputFileName:
        typeof record.generatedOutputFileName === "string"
          ? record.generatedOutputFileName
          : undefined,
      status:
        record.status === "generating" || record.status === "error" || record.status === "idle"
          ? record.status
          : undefined,
      statusMessage:
        typeof record.statusMessage === "string" ? record.statusMessage : undefined,
      errorMessage:
        typeof record.errorMessage === "string" ? record.errorMessage : undefined,
      cameraAngle:
        record.cameraAngle && typeof record.cameraAngle === "object"
          ? {
              rotation: normalizeNumber((record.cameraAngle as Record<string, unknown>).rotation, 0),
              pitch: normalizeNumber((record.cameraAngle as Record<string, unknown>).pitch, 0),
              scale: normalizeNumber((record.cameraAngle as Record<string, unknown>).scale, 1),
            }
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
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      semanticImageUrl:
        typeof record.semanticImageUrl === "string"
          ? record.semanticImageUrl
          : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      outputFileName:
        typeof record.outputFileName === "string" ? record.outputFileName : undefined,
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

function normalizeVideoNodeData(value: unknown): VideoNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      videoUrl: typeof record.videoUrl === "string" ? record.videoUrl : "",
      hostedVideoUrl:
        typeof record.hostedVideoUrl === "string"
          ? record.hostedVideoUrl
          : undefined,
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      outputFileName:
        typeof record.outputFileName === "string" ? record.outputFileName : undefined,
      width: typeof record.width === "number" ? record.width : 320,
      height: typeof record.height === "number" ? record.height : 180,
      displayWidth:
        typeof record.displayWidth === "number" ? record.displayWidth : undefined,
      displayHeight:
        typeof record.displayHeight === "number" ? record.displayHeight : undefined,
      sizeBytes:
        typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      durationSeconds:
        typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    };
  }

  return {
    title: "video",
    videoUrl: "",
    width: 320,
    height: 180,
  };
}

function normalizeAudioNodeData(value: unknown): AudioNodeData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : "",
      hostedAudioUrl:
        typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      outputFileName:
        typeof record.outputFileName === "string" ? record.outputFileName : undefined,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      durationSeconds:
        typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
      status:
        record.status === "generating" || record.status === "error"
          ? record.status
          : "idle",
      statusMessage:
        typeof record.statusMessage === "string" ? record.statusMessage : undefined,
      errorMessage:
        typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    };
  }

  return {
    title: "audio",
    audioUrl: "",
    status: "idle",
  };
}

function normalizeUploadedImageNodeDataAsImage(value: unknown): ImageNodeData {
  const uploaded = normalizeUploadedImageNodeData(value);

  return {
    title: uploaded.title,
    imageUrl: uploaded.hostedImageUrl?.trim() || uploaded.imageUrl,
    hostedImageUrl: uploaded.hostedImageUrl,
    previewUrl: uploaded.previewUrl,
    semanticImageUrl: uploaded.semanticImageUrl,
    fileName: uploaded.fileName,
    prompt: uploaded.fileName || uploaded.title || "Image",
    model: undefined,
    width: uploaded.width,
    height: uploaded.height,
    displayWidth: uploaded.displayWidth,
    displayHeight: uploaded.displayHeight,
    sizeBytes: uploaded.sizeBytes,
    generatedOutputFileName: uploaded.outputFileName,
    generatedAt: new Date(0).toISOString(),
  };
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePanorama360NodeData(value: unknown): Panorama360NodeData {
  const fallback: Panorama360NodeData = {
    title: "360全景图",
    panorama360Node: {
      version: 1,
      mode: "panorama",
      viewport: {
        activeView: "default",
        panoramaView: {
          yaw: 0,
          pitch: 0,
          fov: 72,
        },
      },
      panorama: {
        isLoaded: false,
        error: null,
      },
      ui: {
        mouseTool: "navigate",
        isEditing: false,
      },
    },
  };

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const panorama360Node =
    record.panorama360Node &&
    typeof record.panorama360Node === "object"
      ? record.panorama360Node as Record<string, unknown>
      : {};
  const viewport =
    panorama360Node.viewport &&
    typeof panorama360Node.viewport === "object"
      ? panorama360Node.viewport as Record<string, unknown>
      : {};
  const panoramaView =
    viewport.panoramaView &&
    typeof viewport.panoramaView === "object"
      ? viewport.panoramaView as Record<string, unknown>
      : {};
  const panorama =
    panorama360Node.panorama &&
    typeof panorama360Node.panorama === "object"
      ? panorama360Node.panorama as Record<string, unknown>
      : {};
  const ui =
    panorama360Node.ui &&
    typeof panorama360Node.ui === "object"
      ? panorama360Node.ui as Record<string, unknown>
      : {};

  return {
    title: typeof record.title === "string" ? record.title : fallback.title,
    panorama360Node: {
      version: 1,
      mode: "panorama",
      viewport: {
        activeView: "default",
        panoramaView: {
          yaw: normalizeNumber(panoramaView.yaw, 0),
          pitch: normalizeNumber(panoramaView.pitch, 0),
          fov: normalizeNumber(panoramaView.fov, 72),
        },
      },
      panorama: {
        sourceSignature:
          typeof panorama.sourceSignature === "string"
            ? panorama.sourceSignature
            : undefined,
        isLoaded:
          typeof panorama.isLoaded === "boolean"
            ? panorama.isLoaded
            : false,
        error:
          typeof panorama.error === "string"
            ? panorama.error
            : null,
        generatedImageUrl:
          typeof panorama.generatedImageUrl === "string"
            ? panorama.generatedImageUrl
            : undefined,
        generatedHostedImageUrl:
          typeof panorama.generatedHostedImageUrl === "string"
            ? panorama.generatedHostedImageUrl
            : undefined,
        generatedOutputFileName:
          typeof panorama.generatedOutputFileName === "string"
            ? panorama.generatedOutputFileName
            : undefined,
        generatedImageWidth:
          typeof panorama.generatedImageWidth === "number"
            ? panorama.generatedImageWidth
            : undefined,
        generatedImageHeight:
          typeof panorama.generatedImageHeight === "number"
            ? panorama.generatedImageHeight
            : undefined,
        generatedImageFormat:
          typeof panorama.generatedImageFormat === "string"
            ? panorama.generatedImageFormat
            : undefined,
        generatedImageSizeBytes:
          typeof panorama.generatedImageSizeBytes === "number"
            ? panorama.generatedImageSizeBytes
            : undefined,
        generatedModel:
          typeof panorama.generatedModel === "string"
            ? panorama.generatedModel
            : undefined,
        generatedAt:
          typeof panorama.generatedAt === "string"
            ? panorama.generatedAt
            : undefined,
        generationStatus:
          panorama.generationStatus === "generating" ||
          panorama.generationStatus === "error"
            ? panorama.generationStatus
            : "idle",
        generationErrorMessage:
          typeof panorama.generationErrorMessage === "string"
            ? panorama.generationErrorMessage
            : undefined,
      },
      ui: {
        mouseTool: "navigate",
        isEditing:
          typeof ui.isEditing === "boolean"
            ? ui.isEditing
            : false,
      },
    },
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
    case "storyboard_script":
      return {
        id: record.id,
        type: "storyboard_script",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeStoryboardScriptNodeData(parsed),
      };
    case "storyboard_grid":
      return {
        id: record.id,
        type: "storyboard_grid",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeStoryboardGridNodeData(parsed),
      };
    case "image_generation":
      return {
        id: record.id,
        type: "image_generation",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeImageGenerationNodeData(parsed),
      };
    case "video_generation":
      return {
        id: record.id,
        type: "video_generation",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeVideoGenerationNodeData(parsed),
      };
    case "audio_generation":
      return {
        id: record.id,
        type: "audio_generation",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeAudioGenerationNodeData(parsed),
      };
    case "video_upscale":
      return {
        id: record.id,
        type: "video_upscale",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeVideoUpscaleNodeData(parsed),
      };
    case "video":
      return {
        id: record.id,
        type: "video",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeVideoNodeData(parsed),
      };
    case "audio":
      return {
        id: record.id,
        type: "audio",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeAudioNodeData(parsed),
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
        type: "image",
        position: { x: record.positionX, y: record.positionY },
        data: normalizeUploadedImageNodeDataAsImage(parsed),
      };
    case "panorama-360":
      return {
        id: record.id,
        type: "panorama-360",
        position: { x: record.positionX, y: record.positionY },
        data: normalizePanorama360NodeData(parsed),
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
