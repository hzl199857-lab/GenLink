type ImageDimensions = {
  width: number;
  height: number;
};

export type CanvasImageAssetUploadKind = "original" | "preview" | "semantic";

export type CanvasImageDerivativeOptions = {
  maxEdge: number;
  mimeType: string;
  quality: number;
};

export type HostedCanvasImageData = {
  title: string;
  imageUrl: string;
  hostedImageUrl: string;
  previewUrl: string;
  semanticImageUrl: string;
  fileName: string;
  prompt: string;
  generatedAt: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type PendingCanvasImageData = {
  title: string;
  imageUrl: string;
  previewUrl: string;
  fileName: string;
  prompt: string;
  generatedAt: string;
  width: number;
  height: number;
  sizeBytes: number;
  status: "generating";
  errorMessage?: undefined;
};

export type CreatePendingCanvasImageDataOptions = {
  previewUrl: string;
  dimensions: ImageDimensions;
  now?: () => string;
};

export type CreateHostedCanvasImageDataDeps = {
  now?: () => string;
  readImageDataUrl: (file: File) => Promise<string>;
  readImageDimensions: (url: string) => Promise<ImageDimensions>;
  createDerivativeDataUrl?: (
    dataUrl: string,
    options: CanvasImageDerivativeOptions,
  ) => Promise<string>;
  uploadOriginalImageFile?: (
    file: File,
    kind?: CanvasImageAssetUploadKind,
  ) => Promise<string>;
  uploadImageDataUrl: (
    dataUrl: string,
    fileName?: string,
    kind?: CanvasImageAssetUploadKind,
  ) => Promise<string>;
};

const PREVIEW_DERIVATIVE_OPTIONS: CanvasImageDerivativeOptions = {
  maxEdge: 768,
  mimeType: "image/jpeg",
  quality: 0.86,
};

const SEMANTIC_DERIVATIVE_OPTIONS: CanvasImageDerivativeOptions = {
  maxEdge: 2048,
  mimeType: "image/jpeg",
  quality: 0.9,
};

export function createPendingCanvasImageData(
  file: File,
  options: CreatePendingCanvasImageDataOptions,
): PendingCanvasImageData {
  return {
    title: file.name,
    imageUrl: options.previewUrl,
    previewUrl: options.previewUrl,
    fileName: file.name,
    prompt: file.name,
    generatedAt: options.now?.() ?? new Date().toISOString(),
    width: options.dimensions.width || 320,
    height: options.dimensions.height || 320,
    sizeBytes: file.size,
    status: "generating",
    errorMessage: undefined,
  };
}

export async function createHostedCanvasImageData(
  file: File,
  deps: CreateHostedCanvasImageDataDeps,
): Promise<HostedCanvasImageData> {
  const dataUrl = await deps.readImageDataUrl(file);
  const [dimensions, originalUrl, previewUrl, semanticImageUrl] = await Promise.all([
    deps.readImageDimensions(dataUrl),
    deps.uploadOriginalImageFile
      ? deps.uploadOriginalImageFile(file, "original")
      : deps.uploadImageDataUrl(dataUrl, file.name, "original"),
    deps.createDerivativeDataUrl
      ? deps.createDerivativeDataUrl(dataUrl, PREVIEW_DERIVATIVE_OPTIONS).then((previewDataUrl) =>
          deps.uploadImageDataUrl(previewDataUrl, file.name, "preview"),
        )
      : Promise.resolve<string | undefined>(undefined),
    deps.createDerivativeDataUrl
      ? deps.createDerivativeDataUrl(dataUrl, SEMANTIC_DERIVATIVE_OPTIONS).then((semanticDataUrl) =>
          deps.uploadImageDataUrl(semanticDataUrl, file.name, "semantic"),
        )
      : Promise.resolve<string | undefined>(undefined),
  ]);

  return {
    title: file.name,
    imageUrl: originalUrl,
    hostedImageUrl: originalUrl,
    previewUrl: previewUrl ?? originalUrl,
    semanticImageUrl: semanticImageUrl ?? originalUrl,
    fileName: file.name,
    prompt: file.name,
    generatedAt: deps.now?.() ?? new Date().toISOString(),
    width: dimensions.width || 320,
    height: dimensions.height || 320,
    sizeBytes: file.size,
  };
}
