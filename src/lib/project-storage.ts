'use client';

import type {
  AudioGenerationNodeData,
  AudioNodeData,
  CanvasDocument,
  CanvasNode,
  ImageGenerationNodeData,
  MaterialLibraryCategory,
  MaterialLibraryFolder,
  MaterialLibraryItem,
  ProjectManifest,
  ProjectOutputHistoryItem,
  ProjectSnapshot,
  VideoNodeData,
  VideoGenerationNodeData,
  VideoUpscaleNodeData,
} from "@/types/canvas";
import {
  buildCanvasDocumentFromSnapshot,
  buildProjectManifestFromSnapshot,
  buildProjectSnapshot,
  mergeProjectManifestAndCanvas,
} from "@/lib/project-snapshot";
import { getMaterialKind } from "@/lib/material-library";
import { migrateLegacyProjectSnapshot } from "@/lib/canvas/multi-canvas";

const PROJECT_DB_NAME = "genlink-project-library";
const PROJECT_RECOVERY_DB_NAMES = ["genlink-project-library-v2"];
export const PROJECT_DB_VERSION = 2;
const PROJECT_STORE_NAME = "projects";
const PROJECT_OWNER_INDEX_NAME = "ownerUserId";
export const PROJECT_OWNERSHIP_ERROR = "该项目属于其他用户，无法覆盖";
export const PROJECT_LIBRARY_INDEX_ERROR_NAME = "ProjectLibraryIndexError";
export const PROJECT_LIBRARY_INDEX_ERROR_MESSAGE =
  "项目列表暂时无法读取，请刷新页面后重试。";
const PROJECT_FILE_NAME = "project.json";
const CANVAS_DIRECTORY_NAME = "canvases";
const OUTPUT_DIRECTORY_NAME = "output";
const OUTPUT_HISTORY_FILE_NAME = "history.json";
const PROJECT_IMPORT_NESTED_DEPTH = 1;
const PROJECT_MANIFEST_LOCK_PREFIX = "genlink:project-manifest";
const THUMBNAIL_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

type PersistedProjectRecord = {
  id: string;
  ownerUserId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  directoryName: string;
  projectHandle: FileSystemDirectoryHandle;
  parentHandle: FileSystemDirectoryHandle;
};

const sessionProjectRecords = new Map<
  string,
  Map<string, PersistedProjectRecord>
>();
const sessionProjectTombstones = new Map<string, Set<string>>();
let projectDatabaseUnavailable = false;

function rememberSessionProjectRecord(
  record: PersistedProjectRecord,
  userId: string,
): void {
  let records = sessionProjectRecords.get(userId);

  if (!records) {
    records = new Map();
    sessionProjectRecords.set(userId, records);
  }

  records.set(record.id, { ...record, ownerUserId: userId });
  const tombstones = sessionProjectTombstones.get(userId);
  tombstones?.delete(record.id);

  if (tombstones?.size === 0) {
    sessionProjectTombstones.delete(userId);
  }
}

function forgetSessionProjectRecord(projectId: string, userId: string): void {
  const records = sessionProjectRecords.get(userId);
  records?.delete(projectId);

  if (records?.size === 0) {
    sessionProjectRecords.delete(userId);
  }
}

function readSessionProjectRecords(userId: string): PersistedProjectRecord[] {
  return [...(sessionProjectRecords.get(userId)?.values() ?? [])];
}

function rememberSessionProjectTombstone(projectId: string, userId: string): void {
  let tombstones = sessionProjectTombstones.get(userId);

  if (!tombstones) {
    tombstones = new Set();
    sessionProjectTombstones.set(userId, tombstones);
  }

  tombstones.add(projectId);
  forgetSessionProjectRecord(projectId, userId);
}

function forgetSessionProjectTombstone(projectId: string, userId: string): void {
  const tombstones = sessionProjectTombstones.get(userId);
  tombstones?.delete(projectId);

  if (tombstones?.size === 0) {
    sessionProjectTombstones.delete(userId);
  }
}

function readSessionProjectTombstones(userId: string): string[] {
  return [...(sessionProjectTombstones.get(userId) ?? [])];
}

function getProjectRecordTimestamp(record: Pick<PersistedProjectRecord, "updatedAt">): number {
  const timestamp = new Date(record.updatedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

type OutputHistoryManifestItem = {
  id: string;
  sourceKey?: string;
  fileName: string;
  kind: "image" | "video" | "audio";
  createdAt: string;
  modifiedAt: string;
  mimeType?: string;
  sizeBytes?: number;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  nodeData?: ImageGenerationNodeData | VideoGenerationNodeData | VideoUpscaleNodeData | VideoNodeData | AudioGenerationNodeData | AudioNodeData;
};

function isImageHistoryManifestItem(
  item: OutputHistoryManifestItem | undefined,
): item is OutputHistoryManifestItem & { kind: "image"; nodeData?: ImageGenerationNodeData } {
  return item?.kind === "image";
}

function isVideoHistoryManifestItem(
  item: OutputHistoryManifestItem | undefined,
): item is OutputHistoryManifestItem & { kind: "video"; nodeData?: VideoGenerationNodeData | VideoUpscaleNodeData | VideoNodeData } {
  return item?.kind === "video";
}

function isAudioHistoryManifestItem(
  item: OutputHistoryManifestItem | undefined,
): item is OutputHistoryManifestItem & { kind: "audio"; nodeData?: AudioGenerationNodeData | AudioNodeData } {
  return item?.kind === "audio";
}

type OutputHistoryManifest = {
  items: OutputHistoryManifestItem[];
};

export interface ProjectLibraryItem {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  directoryName: string;
  thumbnailUrl?: string;
}

export interface ProjectHandleRecord extends ProjectLibraryItem {
  projectHandle: FileSystemDirectoryHandle;
  parentHandle: FileSystemDirectoryHandle;
}

export type ProjectCanvasMutation =
  | { type: "rename"; canvasId: string; name: string; updatedAt: string }
  | { type: "delete"; canvasId: string; updatedAt: string };

export type ProjectSharedManifestFields = Pick<
  ProjectManifest,
  "name" | "materialFolders" | "materials" | "thumbnailFileName"
>;

function areManifestFieldValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export interface CreateProjectResult {
  project: ProjectHandleRecord;
  snapshot: ProjectSnapshot;
}

export interface ImportProjectsResult {
  projects: ProjectHandleRecord[];
  skippedCount: number;
}

export interface PersistProjectOutputParams {
  sourceKey: string;
  imageUrl: string;
  kind?: "image" | "video" | "audio";
  fileName?: string;
  generatedAt: string;
  nodeData: ImageGenerationNodeData | VideoGenerationNodeData | VideoUpscaleNodeData | VideoNodeData | AudioGenerationNodeData | AudioNodeData;
  title?: string;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
}

export interface PersistProjectOutputResult {
  fileName: string;
  previewUrl: string;
  sizeBytes: number;
}

export function applyPersistedAudioPreview<T extends AudioGenerationNodeData | AudioNodeData>(
  data: T,
  persisted: PersistProjectOutputResult,
  outputFileField: "outputFileName" | "generatedOutputFileName" = "outputFileName",
): T {
  return {
    ...data,
    audioUrl: persisted.previewUrl,
    previewUrl: persisted.previewUrl,
    hostedAudioUrl: isObjectUrl(data.hostedAudioUrl) ? undefined : data.hostedAudioUrl,
    ...(outputFileField === "generatedOutputFileName"
      ? { generatedOutputFileName: persisted.fileName }
      : { outputFileName: persisted.fileName }),
    sizeBytes: persisted.sizeBytes,
  } as T;
}

function toProjectLibraryItem(
  record: PersistedProjectRecord,
): ProjectLibraryItem {
  if (!record.ownerUserId) {
    throw new Error(PROJECT_OWNERSHIP_ERROR);
  }

  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    directoryName: record.directoryName,
  };
}

export function assertProjectOwner(
  project: { ownerUserId?: string },
  userId: string,
): void {
  if (!userId.trim() || project.ownerUserId !== userId) {
    throw new Error(PROJECT_OWNERSHIP_ERROR);
  }
}

function sortProjects<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function sanitizeDirectoryName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").trim();
}

export function sanitizeFileStem(value?: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "output";
  }

  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "output";
}

export function getCanvasDocumentFileName(canvasId: string): string {
  return `${sanitizeFileStem(canvasId)}.json`;
}

export function inferExtension(format?: string, mimeType?: string): string {
  const normalizedFormat = format?.trim().toLowerCase();

  if (normalizedFormat) {
    if (normalizedFormat === "jpeg") {
      return "jpg";
    }

    return normalizedFormat;
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase();

  switch (normalizedMimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
      return "ogg";
    case "audio/webm":
      return "webm";
    default:
      return "png";
  }
}

export function inferOutputKind(
  fileName: string,
  mimeType?: string,
): "image" | "video" | "audio" | null {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (normalizedMimeType?.startsWith("image/")) {
    return "image";
  }

  if (normalizedMimeType?.startsWith("video/")) {
    return "video";
  }

  if (normalizedMimeType?.startsWith("audio/")) {
    return "audio";
  }

  const lowerFileName = fileName.toLowerCase();

  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(lowerFileName)) {
    return "image";
  }

  if (/\.(mp4|webm|mov|m4v)$/.test(lowerFileName)) {
    return "video";
  }

  if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(lowerFileName)) {
    return "audio";
  }

  return null;
}

function isThumbnailImageFile(file: File): boolean {
  return file.type.startsWith("image/") || THUMBNAIL_IMAGE_EXTENSION_PATTERN.test(file.name);
}

function isDataUrl(value?: string): boolean {
  return Boolean(value?.startsWith("data:"));
}

function compactOutputSourceKey(sourceKey: string | undefined, fileName: string): string | undefined {
  const trimmed = sourceKey?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= 2000 && !trimmed.includes("data:image/")) {
    return trimmed;
  }

  return `file:${fileName}`;
}

function normalizeMaterialCategory(value: unknown): MaterialLibraryCategory | null {
  return value === "人物" ||
    value === "场景" ||
    value === "物品" ||
    value === "风格" ||
    value === "音效" ||
    value === "文本" ||
    value === "其他"
    ? value
    : null;
}

function normalizeMaterialLibraryFolders(value: unknown): MaterialLibraryFolder[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const folders = value.flatMap((item, index): MaterialLibraryFolder[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const category = normalizeMaterialCategory(record.category);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `material-folder-${index}`;

    if (!category || !name || seen.has(id)) {
      return [];
    }

    seen.add(id);

    return [{
      id,
      name,
      category,
      createdAt:
        typeof record.createdAt === "string" && record.createdAt.trim()
          ? record.createdAt
          : new Date(0).toISOString(),
    }];
  });

  return folders.length > 0 ? folders : undefined;
}

function normalizeMaterialLibraryItems(
  value: unknown,
  folders: MaterialLibraryFolder[] = [],
): MaterialLibraryItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const items = value.flatMap((item, index): MaterialLibraryItem[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const category = normalizeMaterialCategory(record.category);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const kind = record.kind === "video" || record.kind === "audio" ? record.kind : "image";
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
    const mediaUrl =
      typeof record.mediaUrl === "string" && record.mediaUrl.trim()
        ? record.mediaUrl.trim()
        : imageUrl;

    if (!category || !name || !mediaUrl) {
      return [];
    }

    const folderId =
      typeof record.folderId === "string" && record.folderId.trim()
        ? record.folderId.trim()
        : undefined;
    const folder = folderId ? folderById.get(folderId) : undefined;

    return [{
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `material-${index}`,
      name,
      category,
      folderId: folder && folder.category === category ? folder.id : undefined,
      kind,
      mediaUrl,
      imageUrl: imageUrl || mediaUrl,
      hostedMediaUrl:
        typeof record.hostedMediaUrl === "string" && record.hostedMediaUrl.trim()
          ? record.hostedMediaUrl
          : undefined,
      previewUrl:
        typeof record.previewUrl === "string" && record.previewUrl.trim()
          ? record.previewUrl
          : undefined,
      hostedImageUrl:
        typeof record.hostedImageUrl === "string" && record.hostedImageUrl.trim()
          ? record.hostedImageUrl
          : undefined,
      fileName:
        typeof record.fileName === "string" && record.fileName.trim()
          ? record.fileName
          : undefined,
      outputFileName:
        typeof record.outputFileName === "string" && record.outputFileName.trim()
          ? record.outputFileName
          : undefined,
      sourceNodeType:
        record.sourceNodeType === "image_generation" ||
        record.sourceNodeType === "image" ||
        record.sourceNodeType === "uploaded_image" ||
        record.sourceNodeType === "video_generation" ||
        record.sourceNodeType === "video_upscale" ||
        record.sourceNodeType === "video" ||
        record.sourceNodeType === "audio_generation" ||
        record.sourceNodeType === "audio"
          ? record.sourceNodeType
          : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      displayWidth: typeof record.displayWidth === "number" ? record.displayWidth : undefined,
      displayHeight: typeof record.displayHeight === "number" ? record.displayHeight : undefined,
      durationSeconds:
        typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
      mimeType:
        typeof record.mimeType === "string" && record.mimeType.trim()
          ? record.mimeType
          : undefined,
      sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      format:
        typeof record.format === "string" && record.format.trim()
          ? record.format
          : undefined,
      createdAt:
        typeof record.createdAt === "string" && record.createdAt.trim()
          ? record.createdAt
          : new Date(0).toISOString(),
    }];
  });

  return items.length > 0 ? items : undefined;
}

export function stripEmbeddedImageDataFromNodeData(
  nodeData: ImageGenerationNodeData,
  generatedOutputFileName?: string,
): ImageGenerationNodeData {
  const next: ImageGenerationNodeData = {
    ...nodeData,
    generatedOutputFileName:
      generatedOutputFileName ?? nodeData.generatedOutputFileName,
  };

  if (isDataUrl(next.generatedImageUrl)) {
    next.generatedImageUrl = undefined;
  }

  if (isObjectUrl(next.generatedHostedImageUrl)) {
    next.generatedHostedImageUrl = undefined;
  }

  if (next.referenceImages?.length) {
    next.referenceImages = next.referenceImages.map((image) => ({
      ...image,
      imageUrl:
        isDataUrl(image.imageUrl) && image.hostedImageUrl?.trim()
          ? image.hostedImageUrl
          : isDataUrl(image.imageUrl)
            ? ""
            : image.imageUrl,
    }));
  }

  if (next.generationResults?.length) {
    next.generationResults = next.generationResults.map((result) => {
      if (result.status !== "completed") {
        return result;
      }

      return {
        ...result,
        imageUrl: isDataUrl(result.imageUrl) ? undefined : result.imageUrl,
        hostedImageUrl: isObjectUrl(result.hostedImageUrl)
          ? undefined
          : result.hostedImageUrl,
      };
    });
  }

  return next;
}

async function hostImageUrlForBrowserRead(
  imageUrl: string,
  fileName?: string,
): Promise<string> {
  const trimmedImageUrl = imageUrl.trim();
  const response = await fetch("/api/image-hosting/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      trimmedImageUrl.startsWith("data:")
        ? { dataUrl: trimmedImageUrl, fileName }
        : { imageUrl: trimmedImageUrl, fileName },
    ),
  });
  const json = (await response.json()) as
    | { ok: true; result: { imageUrl: string } }
    | { ok: false; error: string };

  if (!response.ok || !json.ok) {
    throw new Error("error" in json ? json.error : "Image hosting failed");
  }

  return json.result.imageUrl;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    throw new Error("Invalid generated image data URL");
  }

  const mimeType = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function readRemoteMediaBlobViaProxy(imageUrl: string): Promise<Blob> {
  const response = await fetch("/api/image-hosting/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    throw new Error("Failed to read generated media");
  }

  return response.blob();
}

export async function readImageOutputBlob(
  imageUrl: string,
  fileName?: string,
): Promise<Blob> {
  const trimmedImageUrl = imageUrl.trim();

  if (trimmedImageUrl.startsWith("data:")) {
    return dataUrlToBlob(trimmedImageUrl);
  }

  try {
    const response = await fetch(trimmedImageUrl);

    if (!response.ok) {
      throw new Error("Failed to read generated media");
    }

    return await response.blob();
  } catch {
    if (trimmedImageUrl.startsWith("blob:")) {
      throw new Error("Failed to read generated media");
    }

    if (/^https?:\/\//i.test(trimmedImageUrl)) {
      try {
        return await readRemoteMediaBlobViaProxy(trimmedImageUrl);
      } catch {
        // Fall back to hosting first for URLs that need server-side normalization.
      }
    }

    const hostedImageUrl = await hostImageUrlForBrowserRead(trimmedImageUrl, fileName);
    const response = await fetch(hostedImageUrl);

    if (!response.ok) {
      try {
        return await readRemoteMediaBlobViaProxy(hostedImageUrl);
      } catch {
        // Fall through to the existing user-facing save error.
      }

      throw new Error("Failed to read hosted generated media");
    }

    return response.blob();
  }
}

function ensureIndexedDbSupport(): void {
  if (
    typeof window === "undefined" ||
    typeof window.indexedDB === "undefined"
  ) {
    throw new Error("\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u9879\u76ee\u7d22\u5f15\u5b58\u50a8");
  }
}

function ensureDirectoryPickerSupport(): void {
  if (
    typeof window === "undefined" ||
    typeof window.showDirectoryPicker !== "function"
  ) {
    throw new Error("\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u9879\u76ee\u6587\u4ef6\u7cfb\u7edf\u8bbf\u95ee");
  }
}

async function requestPersistentBrowserStorage(): Promise<void> {
  try {
    await window.navigator.storage?.persist?.();
  } catch {
    // Persistence is a best-effort durability hint after an explicit directory pick.
  }
}

function createProjectLibraryIndexError(): Error {
  const error = new Error(PROJECT_LIBRARY_INDEX_ERROR_MESSAGE);
  error.name = PROJECT_LIBRARY_INDEX_ERROR_NAME;
  return error;
}

export function isProjectLibraryIndexError(error: unknown): boolean {
  return error instanceof Error && error.name === PROJECT_LIBRARY_INDEX_ERROR_NAME;
}

function isInternalProjectLibraryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /^internal error\.?$/i.test(error.message.trim()) ||
    error.name === "UnknownError" ||
    error.name === "InvalidStateError"
  );
}

function openProjectDb(
  databaseName = PROJECT_DB_NAME,
  requestedVersion?: number,
): Promise<IDBDatabase> {
  ensureIndexedDbSupport();

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = requestedVersion === undefined
        ? window.indexedDB.open(databaseName)
        : window.indexedDB.open(databaseName, requestedVersion);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("\u9879\u76ee\u5e93\u521d\u59cb\u5316\u5931\u8d25"));
    };

    request.onerror = () => rejectOnce(
      request.error ?? new Error("\u9879\u76ee\u5e93\u521d\u59cb\u5316\u5931\u8d25"),
    );
    request.onblocked = () => rejectOnce(
      new DOMException("\u9879\u76ee\u5e93\u6b63\u5728\u88ab\u5176\u4ed6 GenLink \u9875\u9762\u4f7f\u7528", "InvalidStateError"),
    );
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        database.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;

      if (settled) {
        database.close();
        return;
      }

      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        const repairVersion = Math.max(database.version + 1, PROJECT_DB_VERSION);
        database.close();
        void openProjectDb(databaseName, repairVersion).then(resolve, rejectOnce);
        return;
      }

      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function withProjectStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
  databaseName = PROJECT_DB_NAME,
): Promise<T> {
  const database = await openProjectDb(databaseName);

  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;

    try {
      transaction = database.transaction(PROJECT_STORE_NAME, mode);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    const store = transaction.objectStore(PROJECT_STORE_NAME);
    let completed = false;
    let operationSettled = false;
    let settled = false;
    let value: T;

    const closeAndReject = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      database.close();
      reject(error instanceof Error ? error : new Error("项目库操作失败"));
    };

    const resolveWhenComplete = () => {
      if (settled || !completed || !operationSettled) {
        return;
      }

      settled = true;
      database.close();
      resolve(value);
    };

    transaction.oncomplete = () => {
      completed = true;
      resolveWhenComplete();
    };
    transaction.onerror = () => {
      closeAndReject(transaction.error ?? new Error("\u9879\u76ee\u5e93\u64cd\u4f5c\u5931\u8d25"));
    };
    transaction.onabort = () => {
      closeAndReject(transaction.error ?? new Error("\u9879\u76ee\u5e93\u64cd\u4f5c\u5df2\u4e2d\u6b62"));
    };

    Promise.resolve()
      .then(() => run(store))
      .then((nextValue) => {
        value = nextValue;
        operationSettled = true;
        resolveWhenComplete();
      })
      .catch(closeAndReject);
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("\u9879\u76ee\u5e93\u8bfb\u53d6\u5931\u8d25"));
  });
}

function collectStoreKeysWithCursor(store: IDBObjectStore): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const keys: IDBValidKey[] = [];
    const request = store.openKeyCursor();

    request.onerror = () => reject(
      request.error ?? new Error("项目主键读取失败"),
    );
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(keys);
        return;
      }

      keys.push(cursor.key);
      cursor.continue();
    };
  });
}

async function readProjectRecordKeysFromDatabase(
  databaseName: string,
): Promise<IDBValidKey[]> {
  try {
    return await withProjectStore(
      "readonly",
      (store) => requestAsPromise(store.getAllKeys()),
      databaseName,
    );
  } catch {
    return withProjectStore(
      "readonly",
      collectStoreKeysWithCursor,
      databaseName,
    );
  }
}

async function readProjectRecordFromDatabase(
  databaseName: string,
  projectId: IDBValidKey,
): Promise<PersistedProjectRecord | undefined> {
  return withProjectStore("readonly", (store) => (
    requestAsPromise(store.get(projectId)) as Promise<PersistedProjectRecord | undefined>
  ), databaseName);
}

async function readAllProjectRecordsFromDatabase(
  databaseName: string,
  userId: string,
): Promise<PersistedProjectRecord[]> {
  const projectIds = await readProjectRecordKeysFromDatabase(databaseName);
  const records: PersistedProjectRecord[] = [];

  for (const projectId of projectIds) {
    try {
      const record = await readProjectRecordFromDatabase(databaseName, projectId);

      if (record?.ownerUserId === userId) {
        records.push(record);
      }
    } catch {
      // File-system handles are structured-cloned values. A stale handle can
      // fail deserialization without making the remaining records unreadable.
    }
  }

  return records;
}

function readIndexedProjectOwner(
  store: IDBObjectStore,
  projectId: string,
): Promise<string | undefined> {
  if (!store.indexNames.contains(PROJECT_OWNER_INDEX_NAME)) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve, reject) => {
    const request = store.index(PROJECT_OWNER_INDEX_NAME).openKeyCursor();

    request.onerror = () => reject(
      request.error ?? new Error("项目归属信息读取失败"),
    );
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(undefined);
        return;
      }

      if (String(cursor.primaryKey) === projectId) {
        resolve(typeof cursor.key === "string" ? cursor.key : undefined);
        return;
      }

      cursor.continue();
    };
  });
}

async function persistProjectRecordDurably(
  record: PersistedProjectRecord,
  userId: string,
): Promise<void> {
  assertProjectOwner({ ownerUserId: userId }, userId);
  try {
    await withProjectStore("readwrite", async (store) => {
      const existing = await requestAsPromise(store.get(record.id)) as PersistedProjectRecord | undefined;

      if (existing?.ownerUserId && existing.ownerUserId !== userId) {
        throw new Error(PROJECT_OWNERSHIP_ERROR);
      }

      await requestAsPromise(store.put({ ...record, ownerUserId: userId }));
    });
  } catch (error) {
    if (!isInternalProjectLibraryError(error)) {
      throw error;
    }

    try {
      await withProjectStore("readwrite", async (store) => {
        const existingKey = await requestAsPromise(store.getKey(record.id));
        const ownerIndexExists = store.indexNames.contains(PROJECT_OWNER_INDEX_NAME);

        if (existingKey !== undefined && !ownerIndexExists) {
          throw createProjectLibraryIndexError();
        }

        const indexedOwner = existingKey === undefined
          ? undefined
          : await readIndexedProjectOwner(store, record.id);

        if (indexedOwner && indexedOwner !== userId) {
          throw new Error(PROJECT_OWNERSHIP_ERROR);
        }

        await requestAsPromise(store.put({ ...record, ownerUserId: userId }));
      });
    } catch (recoveryError) {
      if (recoveryError instanceof Error && recoveryError.message === PROJECT_OWNERSHIP_ERROR) {
        throw recoveryError;
      }

      if (isProjectLibraryIndexError(recoveryError)) {
        throw recoveryError;
      }

      throw createProjectLibraryIndexError();
    }
  }
}

async function persistProjectRecord(
  record: PersistedProjectRecord,
  userId: string,
): Promise<void> {
  if (projectDatabaseUnavailable) {
    rememberSessionProjectRecord(record, userId);
    return;
  }

  try {
    await persistProjectRecordDurably(record, userId);
    forgetSessionProjectRecord(record.id, userId);
  } catch (error) {
    if (error instanceof Error && error.message === PROJECT_OWNERSHIP_ERROR) {
      throw error;
    }

    if (isProjectLibraryIndexError(error) || isInternalProjectLibraryError(error)) {
      projectDatabaseUnavailable = true;
    }
    rememberSessionProjectRecord(record, userId);
  }
}

async function removeProjectRecordDurably(
  projectId: string,
  userId: string,
): Promise<void> {
  assertProjectOwner({ ownerUserId: userId }, userId);
  const errors: unknown[] = [];

  for (const databaseName of [PROJECT_DB_NAME, ...PROJECT_RECOVERY_DB_NAMES]) {
    try {
      await withProjectStore("readwrite", async (store) => {
        const existing = await requestAsPromise(store.get(projectId)) as PersistedProjectRecord | undefined;

        if (!existing) {
          return;
        }

        assertProjectOwner(existing, userId);
        await requestAsPromise(store.delete(projectId));
      }, databaseName);
    } catch (error) {
      if (error instanceof Error && error.message === PROJECT_OWNERSHIP_ERROR) {
        throw error;
      }

      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw errors[0];
  }
}

async function removeProjectRecord(projectId: string, userId: string): Promise<void> {
  try {
    await removeProjectRecordDurably(projectId, userId);
    forgetSessionProjectTombstone(projectId, userId);
  } catch (error) {
    if (error instanceof Error && error.message === PROJECT_OWNERSHIP_ERROR) {
      throw error;
    }

    rememberSessionProjectTombstone(projectId, userId);
  }

  forgetSessionProjectRecord(projectId, userId);
}

async function readAllProjectRecords(userId: string): Promise<PersistedProjectRecord[]> {
  assertProjectOwner({ ownerUserId: userId }, userId);
  const tombstones = new Set(readSessionProjectTombstones(userId));
  const sessionRecords = readSessionProjectRecords(userId).filter(
    (record) => !tombstones.has(record.id),
  );
  const sessionRecordsToPersist = new Map(
    sessionRecords.map((record) => [record.id, record]),
  );
  const recordsById = new Map(
    sessionRecords.map((record) => [record.id, record]),
  );
  const databaseNames = [PROJECT_DB_NAME, ...PROJECT_RECOVERY_DB_NAMES];
  let databaseReadSucceeded = false;

  for (const databaseName of databaseNames) {
    try {
      const records = await readAllProjectRecordsFromDatabase(databaseName, userId);
      databaseReadSucceeded = true;

      for (const record of records) {
        if (tombstones.has(record.id)) {
          continue;
        }

        const existing = recordsById.get(record.id);
        const sessionRecord = sessionRecordsToPersist.get(record.id);
        const recordTimestamp = getProjectRecordTimestamp(record);

        if (
          sessionRecord &&
          recordTimestamp >= getProjectRecordTimestamp(sessionRecord)
        ) {
          sessionRecordsToPersist.delete(record.id);
          forgetSessionProjectRecord(record.id, userId);
        }

        const shouldReplace =
          !existing ||
          recordTimestamp >= getProjectRecordTimestamp(existing);

        if (shouldReplace) {
          recordsById.set(record.id, record);
        }

        if (databaseName !== PROJECT_DB_NAME && shouldReplace) {
          await persistProjectRecord(record, userId).catch(() => {
            // Reads and ownership checks also consult the recovery database.
          });
        }
      }
    } catch {
      // Try the next known project-library database. A failed browser index should
      // not prevent the user from reaching a fresh or migrated project list.
    }
  }

  projectDatabaseUnavailable = !databaseReadSucceeded;

  if (databaseReadSucceeded) {
    for (const projectId of tombstones) {
      try {
        await removeProjectRecordDurably(projectId, userId);
        forgetSessionProjectTombstone(projectId, userId);
      } catch {
        // Keep suppressing the deleted project until durable cleanup succeeds.
      }
    }

    for (const record of sessionRecordsToPersist.values()) {
      try {
        await persistProjectRecordDurably(record, userId);
        forgetSessionProjectRecord(record.id, userId);
      } catch {
        // Keep the session record and retry after a later successful database read.
      }
    }
  }

  return [...recordsById.values()];
}

export async function rebuildProjectLibraryIndex(): Promise<void> {
  ensureIndexedDbSupport();

  try {
    await withProjectStore("readwrite", (store) => requestAsPromise(store.clear()));
    sessionProjectRecords.clear();
    sessionProjectTombstones.clear();
    projectDatabaseUnavailable = false;
    return;
  } catch {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(PROJECT_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(
        request.error ?? new Error("项目索引重建失败"),
      );
      request.onblocked = () => reject(
        new Error("项目索引正在被其他 GenLink 页面使用，请关闭其他标签页后重试。"),
      );
    });
    sessionProjectRecords.clear();
    sessionProjectTombstones.clear();
    projectDatabaseUnavailable = false;
  }
}

async function requireStoredProjectOwner(
  project: ProjectHandleRecord,
  userId: string,
  options?: { requireDurableVerification?: boolean },
): Promise<void> {
  assertProjectOwner(project, userId);
  const sessionRecord = sessionProjectRecords.get(userId)?.get(project.id);
  const tombstoned = sessionProjectTombstones.get(userId)?.has(project.id) ?? false;
  let found = Boolean(sessionRecord) && !tombstoned;
  let durableReadError: unknown;

  if (sessionRecord) {
    assertProjectOwner(sessionRecord, userId);
  }

  for (const databaseName of [PROJECT_DB_NAME, ...PROJECT_RECOVERY_DB_NAMES]) {
    try {
      const record = await readProjectRecordFromDatabase(databaseName, project.id);

      if (!record) {
        continue;
      }

      assertProjectOwner(record, userId);
      found = true;
    } catch (error) {
      if (error instanceof Error && error.message === PROJECT_OWNERSHIP_ERROR) {
        throw error;
      }

      durableReadError ??= error;
    }
  }

  if (options?.requireDurableVerification && durableReadError) {
    throw createProjectLibraryIndexError();
  }

  if (!found) {
    throw new Error(PROJECT_OWNERSHIP_ERROR);
  }
}

async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  writable = true,
): Promise<void> {
  const mode: FileSystemPermissionMode = writable ? "readwrite" : "read";
  const permissionState = handle.queryPermission
    ? await handle.queryPermission({ mode })
    : "prompt";

  if (permissionState === "granted") {
    return;
  }

  const requested = handle.requestPermission
    ? await handle.requestPermission({ mode })
    : "denied";

  if (requested !== "granted") {
    throw new Error("\u672a\u83b7\u5f97\u76ee\u5f55\u8bbf\u95ee\u6743\u9650");
  }
}

async function readTextFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<string> {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeTextFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeJsonFileVerified(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  value: unknown,
): Promise<void> {
  const content = JSON.stringify(value, null, 2);
  const temporaryFileName = `${fileName}.tmp`;

  await writeTextFile(directoryHandle, temporaryFileName, content);

  try {
    JSON.parse(await readTextFile(directoryHandle, temporaryFileName));
    await writeTextFile(directoryHandle, fileName, content);
  } finally {
    await directoryHandle.removeEntry(temporaryFileName).catch(() => {});
  }
}

async function writeBlobFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function fileExists(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

async function getAvailableFileName(
  directoryHandle: FileSystemDirectoryHandle,
  baseName: string,
  extension: string,
  currentFileName?: string,
): Promise<string> {
  const firstFileName = `${baseName}.${extension}`;

  if (firstFileName === currentFileName || !(await fileExists(directoryHandle, firstFileName))) {
    return firstFileName;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName}-${index}.${extension}`;

    if (candidate === currentFileName || !(await fileExists(directoryHandle, candidate))) {
      return candidate;
    }
  }

  return `${baseName}-${crypto.randomUUID()}.${extension}`;
}

async function directoryEntryExists(
  parentHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parentHandle.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function readOutputHistoryManifest(
  projectHandle: FileSystemDirectoryHandle,
): Promise<OutputHistoryManifest> {
  try {
    const outputHandle = await projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME);
    const text = await readTextFile(outputHandle, OUTPUT_HISTORY_FILE_NAME);
    const parsed = JSON.parse(text) as OutputHistoryManifest;

    if (!parsed || !Array.isArray(parsed.items)) {
      return { items: [] };
    }

    return {
      items: parsed.items.filter(
        (item): item is OutputHistoryManifestItem =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.fileName === "string" &&
          (item.kind === "image" || item.kind === "video" || item.kind === "audio"),
      ),
    };
  } catch {
    return { items: [] };
  }
}

async function writeOutputHistoryManifest(
  projectHandle: FileSystemDirectoryHandle,
  manifest: OutputHistoryManifest,
): Promise<void> {
  const outputHandle = await projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME, {
    create: true,
  });
  const sanitizedManifest: OutputHistoryManifest = {
    items: manifest.items.map((item) => ({
      ...item,
      sourceKey: compactOutputSourceKey(item.sourceKey, item.fileName),
      nodeData: item.nodeData
        ? item.kind === "image"
          ? stripEmbeddedImageDataFromNodeData(item.nodeData as ImageGenerationNodeData, item.fileName)
          : item.nodeData
        : undefined,
    })),
  };

  await writeTextFile(
    outputHandle,
    OUTPUT_HISTORY_FILE_NAME,
    JSON.stringify(sanitizedManifest, null, 2),
  );
}

async function copyDirectoryRecursive(
  sourceHandle: FileSystemDirectoryHandle,
  destinationHandle: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [entryName, entryHandle] of sourceHandle.entries()) {
    if (entryHandle.kind === "file") {
      const file = await entryHandle.getFile();
      await writeBlobFile(destinationHandle, entryName, file);
      continue;
    }

    const nextDestination = await destinationHandle.getDirectoryHandle(entryName, {
      create: true,
    });
    await copyDirectoryRecursive(entryHandle, nextDestination);
  }
}

async function tryRemoveProjectDirectory(
  parentHandle: FileSystemDirectoryHandle,
  directoryName: string,
): Promise<void> {
  try {
    await parentHandle.removeEntry(directoryName, { recursive: true });
  } catch {
    // Ignore cleanup errors.
  }
}

async function createProjectDirectorySkeleton(
  projectHandle: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
): Promise<void> {
  await projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME, { create: true });
  const canvasDirectory = await projectHandle.getDirectoryHandle(CANVAS_DIRECTORY_NAME, { create: true });
  const manifest = buildProjectManifestFromSnapshot(snapshot);
  const canvas = buildCanvasDocumentFromSnapshot(snapshot);

  await writeJsonFileVerified(canvasDirectory, getCanvasDocumentFileName(canvas.id), canvas);
  await writeJsonFileVerified(projectHandle, PROJECT_FILE_NAME, manifest);
}

export async function persistProjectSnapshotFiles(
  projectHandle: FileSystemDirectoryHandle,
  manifest: ProjectManifest,
  activeCanvas: CanvasDocument,
  mutation?: ProjectCanvasMutation,
  sharedManifestBase?: ProjectSharedManifestFields,
): Promise<ProjectManifest> {
  const run = async (): Promise<ProjectManifest> => {
    const parsedManifest = JSON.parse(
      await readTextFile(projectHandle, PROJECT_FILE_NAME),
    ) as ProjectManifest;
    if (
      parsedManifest.version !== 2 ||
      parsedManifest.id !== manifest.id ||
      !Array.isArray(parsedManifest.canvases)
    ) {
      throw new Error("项目文件损坏，无法保存");
    }

    const incomingActiveMetadata = manifest.canvases.find(
      (canvas) => canvas.id === activeCanvas.id,
    );
    if (!incomingActiveMetadata) {
      throw new Error("活动画布不在项目清单中");
    }

    const deletedCanvasIds = new Set(
      Array.isArray(parsedManifest.deletedCanvasIds)
        ? parsedManifest.deletedCanvasIds.filter((id): id is string => typeof id === "string")
        : [],
    );
    if (deletedCanvasIds.has(activeCanvas.id)) {
      throw new Error("该画布已被删除，无法保存");
    }

    let canvases = parsedManifest.canvases.map((canvas) => ({ ...canvas }));
    const activeCanvasIndex = canvases.findIndex((canvas) => canvas.id === activeCanvas.id);
    if (activeCanvasIndex >= 0) {
      canvases[activeCanvasIndex] = {
        ...canvases[activeCanvasIndex],
        updatedAt: incomingActiveMetadata.updatedAt,
      };
    } else {
      canvases.push({ ...incomingActiveMetadata });
    }

    if (mutation?.type === "delete") {
      if (mutation.canvasId === activeCanvas.id) {
        throw new Error("不能删除当前活动画布");
      }
      canvases = canvases.filter((canvas) => canvas.id !== mutation.canvasId);
      deletedCanvasIds.add(mutation.canvasId);
    }

    if (canvases.length === 0) {
      throw new Error("最后一个画布不能删除");
    }

    if (mutation?.type === "rename") {
      const renameIndex = canvases.findIndex((canvas) => canvas.id === mutation.canvasId);
      if (renameIndex < 0 || deletedCanvasIds.has(mutation.canvasId)) {
        throw new Error("画布不存在");
      }
      canvases[renameIndex] = {
        ...canvases[renameIndex],
        name: mutation.name,
        updatedAt: mutation.updatedAt,
      };
    }

    const materialFolders = sharedManifestBase &&
      !areManifestFieldValuesEqual(manifest.materialFolders, sharedManifestBase.materialFolders)
      ? manifest.materialFolders
      : parsedManifest.materialFolders;
    const materials = sharedManifestBase &&
      !areManifestFieldValuesEqual(manifest.materials, sharedManifestBase.materials)
      ? manifest.materials
      : parsedManifest.materials;
    const thumbnailFileName = sharedManifestBase &&
      (manifest.thumbnailFileName ?? null) !== (sharedManifestBase.thumbnailFileName ?? null)
      ? manifest.thumbnailFileName
      : parsedManifest.thumbnailFileName;
    const sharedFields: ProjectSharedManifestFields = {
      name: sharedManifestBase && manifest.name !== sharedManifestBase.name
        ? manifest.name
        : parsedManifest.name,
      materialFolders,
      materials,
      thumbnailFileName,
    };
    const nextManifest: ProjectManifest = {
      ...parsedManifest,
      ...sharedFields,
      canvases,
      deletedCanvasIds: deletedCanvasIds.size > 0 ? [...deletedCanvasIds] : undefined,
      updatedAt: mutation?.updatedAt ?? manifest.updatedAt,
    };
    if (!nextManifest.materialFolders?.length) {
      delete nextManifest.materialFolders;
    }
    if (!nextManifest.materials?.length) {
      delete nextManifest.materials;
    }
    if (!nextManifest.thumbnailFileName?.trim()) {
      delete nextManifest.thumbnailFileName;
    }
    const canvasDirectory = await projectHandle.getDirectoryHandle(CANVAS_DIRECTORY_NAME, {
      create: true,
    });
    const canvasEntries: Array<[string, FileSystemHandle]> = [];
    for await (const entry of canvasDirectory.entries()) {
      canvasEntries.push(entry);
    }

    let renamedCanvas: CanvasDocument | null = null;
    let renamedCanvasFileName: string | null = null;
    if (mutation?.type === "rename" && mutation.canvasId !== activeCanvas.id) {
      const renamedMetadata = canvases.find((canvas) => canvas.id === mutation.canvasId)!;
      const actualEntryName = canvasEntries.find(
        ([entryName]) => entryName.toLowerCase() === renamedMetadata.fileName.toLowerCase(),
      )?.[0] ?? renamedMetadata.fileName;
      const parsedCanvas = JSON.parse(
        await readTextFile(canvasDirectory, actualEntryName),
      ) as CanvasDocument;
      if (parsedCanvas.version !== 1 || parsedCanvas.id !== mutation.canvasId) {
        throw new Error("画布文件损坏，无法保存");
      }
      renamedCanvas = {
        ...parsedCanvas,
        name: renamedMetadata.name,
        createdAt: renamedMetadata.createdAt,
        updatedAt: renamedMetadata.updatedAt,
      };
      renamedCanvasFileName = renamedMetadata.fileName;
    }

    const referencedFileNames = new Set(
      nextManifest.canvases.map((canvas) => canvas.fileName.toLowerCase()),
    );
    const orphanedFileNames = canvasEntries.flatMap(([entryName, entryHandle]) => (
      entryHandle.kind === "file" &&
      entryName.toLowerCase().endsWith(".json") &&
      !referencedFileNames.has(entryName.toLowerCase())
        ? [entryName]
        : []
    ));
    const persistedActiveMetadata = nextManifest.canvases.find(
      (canvas) => canvas.id === activeCanvas.id,
    )!;

    await writeJsonFileVerified(
      canvasDirectory,
      persistedActiveMetadata.fileName,
      {
        ...activeCanvas,
        name: persistedActiveMetadata.name,
        createdAt: persistedActiveMetadata.createdAt,
        updatedAt: persistedActiveMetadata.updatedAt,
      },
    );
    if (renamedCanvas && renamedCanvasFileName) {
      await writeJsonFileVerified(canvasDirectory, renamedCanvasFileName, renamedCanvas);
    }
    await writeJsonFileVerified(projectHandle, PROJECT_FILE_NAME, nextManifest);
    for (const orphanedFileName of orphanedFileNames) {
      await canvasDirectory.removeEntry(orphanedFileName);
    }

    return nextManifest;
  };

  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      `${PROJECT_MANIFEST_LOCK_PREFIX}:${encodeURIComponent(manifest.id)}`,
      { mode: "exclusive" },
      run,
    );
  }

  return run();
}

async function readProjectSnapshotInternal(
  projectHandle: FileSystemDirectoryHandle,
  preferredCanvasId?: string,
): Promise<ProjectSnapshot> {
  const text = await readTextFile(projectHandle, PROJECT_FILE_NAME);
  const parsed = JSON.parse(text) as ProjectSnapshot | ProjectManifest;

  if (
    parsed &&
    typeof parsed === "object" &&
    "version" in parsed &&
    parsed.version === 2 &&
    "canvases" in parsed &&
    Array.isArray(parsed.canvases)
  ) {
    const parsedManifest = parsed as ProjectManifest;
    const materialFolders = normalizeMaterialLibraryFolders(parsed.materialFolders);
    const manifest: ProjectManifest = {
      version: 2,
      id: parsedManifest.id,
      name: parsedManifest.name,
      canvases: parsedManifest.canvases.filter((canvas) => (
        Boolean(canvas) &&
        typeof canvas.id === "string" &&
        typeof canvas.name === "string" &&
        typeof canvas.fileName === "string"
      )),
      materialFolders,
      materials: normalizeMaterialLibraryItems(parsedManifest.materials, materialFolders ?? []),
      thumbnailFileName:
        typeof parsedManifest.thumbnailFileName === "string" && parsedManifest.thumbnailFileName.trim()
          ? parsedManifest.thumbnailFileName
          : undefined,
      createdAt: parsedManifest.createdAt,
      updatedAt: parsedManifest.updatedAt,
    };
    const activeCanvas = manifest.canvases.find((canvas) => canvas.id === preferredCanvasId)
      ?? manifest.canvases[0];

    if (!activeCanvas) {
      throw new Error("项目中没有可用画布");
    }

    const canvasDirectory = await projectHandle.getDirectoryHandle(CANVAS_DIRECTORY_NAME);
    const canvasText = await readTextFile(canvasDirectory, activeCanvas.fileName);
    const canvas = JSON.parse(canvasText) as CanvasDocument;

    if (
      !canvas ||
      canvas.version !== 1 ||
      canvas.id !== activeCanvas.id ||
      !Array.isArray(canvas.nodes) ||
      !Array.isArray(canvas.edges) ||
      !canvas.viewport ||
      typeof canvas.viewport.x !== "number" ||
      typeof canvas.viewport.y !== "number" ||
      typeof canvas.viewport.zoom !== "number"
    ) {
      throw new Error("画布文件损坏，无法读取");
    }

    return mergeProjectManifestAndCanvas(manifest, canvas);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.id !== "string" ||
    typeof parsed.name !== "string" ||
    !("nodes" in parsed) ||
    !("edges" in parsed) ||
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new Error("\u9879\u76ee\u6587\u4ef6\u635f\u574f\uff0c\u65e0\u6cd5\u8bfb\u53d6");
  }

  const legacySnapshot = parsed as ProjectSnapshot;
  const materialFolders = normalizeMaterialLibraryFolders(legacySnapshot.materialFolders);

  return {
    ...legacySnapshot,
    materialFolders,
    materials: normalizeMaterialLibraryItems(legacySnapshot.materials, materialFolders ?? []),
    thumbnailFileName:
      typeof legacySnapshot.thumbnailFileName === "string" && legacySnapshot.thumbnailFileName.trim()
        ? legacySnapshot.thumbnailFileName
        : undefined,
  };
}

async function migrateLegacyProjectAtHandle(
  projectHandle: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  const migrated = migrateLegacyProjectSnapshot(snapshot, {
    canvasId: crypto.randomUUID(),
  });
  const canvasDirectory = await projectHandle.getDirectoryHandle(CANVAS_DIRECTORY_NAME, {
    create: true,
  });

  await writeJsonFileVerified(
    canvasDirectory,
    getCanvasDocumentFileName(migrated.canvas.id),
    migrated.canvas,
  );
  await writeJsonFileVerified(projectHandle, PROJECT_FILE_NAME, migrated.manifest);

  return mergeProjectManifestAndCanvas(migrated.manifest, migrated.canvas);
}

type ThumbnailFileCandidate = {
  file: File;
  fileName: string;
};

async function findImageFileByPath(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<File | null> {
  const segments = fileName
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  let currentHandle = directoryHandle;
  const leafFileName = segments[segments.length - 1];

  for (const segment of segments.slice(0, -1)) {
    currentHandle = await currentHandle.getDirectoryHandle(segment);
  }

  const fileHandle = await currentHandle.getFileHandle(leafFileName);
  const file = await fileHandle.getFile();

  return isThumbnailImageFile(file) ? file : null;
}

async function findFirstImageFileRecursive(
  directoryHandle: FileSystemDirectoryHandle,
  relativePath = "",
): Promise<ThumbnailFileCandidate | null> {
  for await (const [entryName, entryHandle] of directoryHandle.entries()) {
    if (entryHandle.kind === "file") {
      const file = await entryHandle.getFile();

      if (isThumbnailImageFile(file)) {
        return {
          file,
          fileName: relativePath ? `${relativePath}/${entryName}` : entryName,
        };
      }

      continue;
    }

    if (entryName === "." || entryName === "..") {
      continue;
    }

    const nestedFile = await findFirstImageFileRecursive(
      entryHandle,
      relativePath ? `${relativePath}/${entryName}` : entryName,
    );

    if (nestedFile) {
      return nestedFile;
    }
  }

  return null;
}

async function readProjectThumbnailUrl(
  projectHandle: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
): Promise<string | undefined> {
  try {
    if (snapshot.thumbnailFileName?.trim()) {
      const file = await findImageFileByPath(
        projectHandle,
        snapshot.thumbnailFileName,
      ).catch(() => null);

      if (file) {
        return URL.createObjectURL(file);
      }
    }

    const candidate = await findFirstImageFileRecursive(projectHandle);

    if (!candidate) {
      return undefined;
    }

    if (candidate.fileName !== snapshot.thumbnailFileName) {
      try {
        await requestDirectoryPermission(projectHandle);
        await writeTextFile(
          projectHandle,
          PROJECT_FILE_NAME,
          JSON.stringify(
            {
              ...snapshot,
              thumbnailFileName: candidate.fileName,
            },
            null,
            2,
          ),
        );
      } catch {
        // Keep showing the selected thumbnail even if the project file cannot be updated yet.
      }
    }

    return URL.createObjectURL(candidate.file);
  } catch {
    return undefined;
  }
}

function getUniqueCopyName(baseName: string, existingNames: Set<string>): string {
  const preferred = `${baseName} - \u526f\u672c`;

  if (!existingNames.has(preferred)) {
    return preferred;
  }

  let index = 2;

  while (existingNames.has(`${preferred} ${index}`)) {
    index += 1;
  }

  return `${preferred} ${index}`;
}

export async function pickProjectParentDirectory(): Promise<FileSystemDirectoryHandle> {
  ensureDirectoryPickerSupport();
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await requestDirectoryPermission(handle);
  await requestPersistentBrowserStorage();
  return handle;
}

export function parseLegacyProjectSnapshotText(text: string): ProjectSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("project.json 不是有效的 JSON 文件");
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "version" in parsed &&
    parsed.version === 2 &&
    "canvases" in parsed &&
    Array.isArray(parsed.canvases)
  ) {
    throw new Error("这是新版项目清单，请使用“批量导入”并选择包含 canvases 文件夹的完整项目目录。");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !("name" in parsed) ||
    typeof parsed.name !== "string" ||
    !("nodes" in parsed) ||
    !Array.isArray(parsed.nodes) ||
    !("edges" in parsed) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new Error("该 project.json 不是可识别的旧版 GenLink 项目文件");
  }

  return parsed as ProjectSnapshot;
}

export async function pickLegacyProjectSnapshotFile(): Promise<ProjectSnapshot> {
  ensureDirectoryPickerSupport();

  if (typeof window.showOpenFilePicker !== "function") {
    throw new Error("当前浏览器不支持直接导入 project.json");
  }

  const [fileHandle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{
      description: "GenLink project.json",
      accept: { "application/json": [".json"] },
    }],
  });

  if (!fileHandle) {
    throw new Error("没有选择 project.json 文件");
  }

  const file = await fileHandle.getFile();
  return parseLegacyProjectSnapshotText(await file.text());
}

export function buildCreatedProjectSnapshot(params: {
  projectName: string;
  sourceSnapshot?: ProjectSnapshot;
  id?: string;
  timestamp?: string;
}): ProjectSnapshot {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const source = params.sourceSnapshot;
  const canvasId = crypto.randomUUID();

  return {
    ...buildProjectSnapshot({
      id: params.id ?? crypto.randomUUID(),
      name: params.projectName,
      nodes: source?.nodes ?? [],
    edges: source?.edges ?? [],
    groups: source?.groups,
    materialFolders: source?.materialFolders,
    materials: source?.materials,
    thumbnailFileName: source?.thumbnailFileName,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    version: 2,
    activeCanvasId: canvasId,
    canvases: [{
      id: canvasId,
      name: "画布 1",
      fileName: getCanvasDocumentFileName(canvasId),
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    viewport: source?.viewport ?? { x: 0, y: 0, zoom: 1 },
  };
}

export async function createProjectAtParentDirectory(params: {
  parentHandle: FileSystemDirectoryHandle;
  projectName: string;
  userId: string;
  sourceSnapshot?: ProjectSnapshot;
}): Promise<CreateProjectResult> {
  const sanitizedName = sanitizeDirectoryName(params.projectName);

  if (!sanitizedName) {
    throw new Error("\u9879\u76ee\u540d\u4e0d\u80fd\u4e3a\u7a7a");
  }

  await requestDirectoryPermission(params.parentHandle);

  if (await directoryEntryExists(params.parentHandle, sanitizedName)) {
    throw new Error("\u8be5\u76ee\u5f55\u4e0b\u5df2\u5b58\u5728\u540c\u540d\u9879\u76ee");
  }

  const snapshot = buildCreatedProjectSnapshot({
    projectName: sanitizedName,
    sourceSnapshot: params.sourceSnapshot,
  });
  const projectHandle = await params.parentHandle.getDirectoryHandle(sanitizedName, {
    create: true,
  });

  try {
    await createProjectDirectorySkeleton(projectHandle, snapshot);

    const record: PersistedProjectRecord = {
      id: snapshot.id,
      ownerUserId: params.userId,
      name: sanitizedName,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      directoryName: sanitizedName,
      projectHandle,
      parentHandle: params.parentHandle,
    };

    await persistProjectRecord(record, params.userId);

    return {
      project: {
        ...toProjectLibraryItem(record),
        projectHandle,
        parentHandle: params.parentHandle,
      },
      snapshot,
    };
  } catch (error) {
    await tryRemoveProjectDirectory(params.parentHandle, sanitizedName);
    throw error;
  }
}

export async function importProjectsFromParentDirectory(
  parentHandle: FileSystemDirectoryHandle,
  userId: string,
): Promise<ImportProjectsResult> {
  await requestDirectoryPermission(parentHandle);

  const records: PersistedProjectRecord[] = [];
  let skippedCount = 0;
  let selectedProjectSnapshot: ProjectSnapshot | null = null;

  try {
    selectedProjectSnapshot = await readProjectSnapshotInternal(parentHandle);
  } catch {
    // If the selected directory is not itself a project, scan its children.
  }

  if (selectedProjectSnapshot) {
    const timestamp = new Date().toISOString();
    const projectName = sanitizeDirectoryName(selectedProjectSnapshot.name || parentHandle.name);
    const record: PersistedProjectRecord = {
      id: selectedProjectSnapshot.id,
      ownerUserId: userId,
      name: projectName || parentHandle.name,
      createdAt: selectedProjectSnapshot.createdAt || timestamp,
      updatedAt: selectedProjectSnapshot.updatedAt || timestamp,
      directoryName: parentHandle.name,
      projectHandle: parentHandle,
      parentHandle,
    };

    await persistProjectRecord(record, userId);

    return {
      projects: [{
        ...toProjectLibraryItem(record),
        projectHandle: parentHandle,
        parentHandle,
      }],
      skippedCount,
    };
  }

  const scanDirectory = async (
    containerHandle: FileSystemDirectoryHandle,
    depth: number,
  ): Promise<void> => {
    const iterableContainer = containerHandle as FileSystemDirectoryHandle & {
      values: () => AsyncIterable<FileSystemHandle>;
    };

    for await (const childHandle of iterableContainer.values()) {
      if (childHandle.kind !== "directory") {
        continue;
      }

      const projectHandle = childHandle as FileSystemDirectoryHandle;

      try {
        const snapshot = await readProjectSnapshotInternal(projectHandle);
        const timestamp = new Date().toISOString();
        const projectName = sanitizeDirectoryName(snapshot.name || projectHandle.name);
        records.push({
          id: snapshot.id,
          ownerUserId: userId,
          name: projectName || projectHandle.name,
          createdAt: snapshot.createdAt || timestamp,
          updatedAt: snapshot.updatedAt || timestamp,
          directoryName: projectHandle.name,
          projectHandle,
          parentHandle: containerHandle,
        });
      } catch {
        if (depth < PROJECT_IMPORT_NESTED_DEPTH) {
          await scanDirectory(projectHandle, depth + 1);
        } else {
          skippedCount += 1;
        }
      }
    }
  };

  await scanDirectory(parentHandle, 0);

  for (const record of records) {
    await persistProjectRecord(record, userId);
  }

  return {
    projects: sortProjects(records.map((record) => ({
      ...toProjectLibraryItem(record),
      projectHandle: record.projectHandle,
      parentHandle: record.parentHandle,
    }))),
    skippedCount,
  };
}

export async function loadProjectSnapshot(
  project: ProjectHandleRecord,
  userId: string,
  canvasId?: string,
): Promise<ProjectSnapshot> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.projectHandle, false);
  const snapshot = await readProjectSnapshotInternal(project.projectHandle, canvasId);

  if (snapshot.version === 2) {
    return snapshot;
  }

  await requestDirectoryPermission(project.projectHandle);
  return migrateLegacyProjectAtHandle(project.projectHandle, snapshot);
}

export async function saveProjectSnapshot(
  project: ProjectHandleRecord,
  snapshot: ProjectSnapshot,
  userId: string,
  canvasMutation?: ProjectCanvasMutation,
  sharedManifestBase?: ProjectSharedManifestFields,
): Promise<{ project: ProjectHandleRecord; snapshot: ProjectSnapshot }> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.projectHandle);
  const existingSnapshot = await readProjectSnapshotInternal(project.projectHandle).catch(() => null);
  const thumbnailChangedFromBase = Boolean(
    sharedManifestBase &&
    (snapshot.thumbnailFileName ?? null) !== (sharedManifestBase.thumbnailFileName ?? null),
  );
  const thumbnailFileName = thumbnailChangedFromBase
    ? snapshot.thumbnailFileName
    : snapshot.thumbnailFileName ?? existingSnapshot?.thumbnailFileName;
  const timestamp = new Date().toISOString();
  const sourceSnapshot: ProjectSnapshot = {
    ...snapshot,
    thumbnailFileName,
    updatedAt: timestamp,
  };
  const canvas = buildCanvasDocumentFromSnapshot(sourceSnapshot);
  const existingManifest = buildProjectManifestFromSnapshot(sourceSnapshot);
  const canvasMetadata = {
    id: canvas.id,
    name: canvas.name,
    fileName: getCanvasDocumentFileName(canvas.id),
    createdAt: canvas.createdAt,
    updatedAt: timestamp,
  };
  const manifest: ProjectManifest = {
    ...existingManifest,
    updatedAt: timestamp,
    canvases: existingManifest.canvases.some((item) => item.id === canvas.id)
      ? existingManifest.canvases.map((item) => item.id === canvas.id ? canvasMetadata : item)
      : [...existingManifest.canvases, canvasMetadata],
  };
  const nextCanvas: CanvasDocument = {
    ...canvas,
    updatedAt: timestamp,
  };
  const persistedManifest = await persistProjectSnapshotFiles(
    project.projectHandle,
    manifest,
    nextCanvas,
    canvasMutation,
    sharedManifestBase,
  );
  const persistedActiveMetadata = persistedManifest.canvases.find(
    (item) => item.id === nextCanvas.id,
  );
  const persistedCanvas = persistedActiveMetadata
    ? {
        ...nextCanvas,
        name: persistedActiveMetadata.name,
        createdAt: persistedActiveMetadata.createdAt,
        updatedAt: persistedActiveMetadata.updatedAt,
      }
    : nextCanvas;
  const nextSnapshot = mergeProjectManifestAndCanvas(persistedManifest, persistedCanvas);

  const nextRecord: PersistedProjectRecord = {
    ...project,
    name: nextSnapshot.name,
    updatedAt: nextSnapshot.updatedAt,
  };

  await persistProjectRecord(nextRecord, userId);

  return {
    project: {
      ...toProjectLibraryItem(nextRecord),
      projectHandle: project.projectHandle,
      parentHandle: project.parentHandle,
    },
    snapshot: nextSnapshot,
  };
}

export async function listProjectLibrary(userId: string): Promise<ProjectHandleRecord[]> {
  const records = await readAllProjectRecords(userId);
  const validProjects: ProjectHandleRecord[] = [];

  for (const record of sortProjects(records)) {
    const fallbackProject: ProjectHandleRecord = {
      ...toProjectLibraryItem(record),
      projectHandle: record.projectHandle,
      parentHandle: record.parentHandle,
    };

    try {
      const permissionState = record.projectHandle.queryPermission
        ? await record.projectHandle.queryPermission({ mode: "read" })
        : "prompt";

      if (permissionState !== "granted") {
        validProjects.push(fallbackProject);
        continue;
      }

      const snapshot = await readProjectSnapshotInternal(record.projectHandle);
      const thumbnailUrl = await readProjectThumbnailUrl(record.projectHandle, snapshot);
      validProjects.push({
        ...fallbackProject,
        thumbnailUrl,
      });
    } catch {
      validProjects.push(fallbackProject);
    }
  }

  return validProjects;
}

export async function getStoredProjectRecordCount(userId: string): Promise<number> {
  return (await readAllProjectRecords(userId)).length;
}

export async function renameProjectDirectory(
  project: ProjectHandleRecord,
  nextName: string,
  userId: string,
): Promise<ProjectHandleRecord> {
  await requireStoredProjectOwner(project, userId);
  const sanitizedName = sanitizeDirectoryName(nextName);

  if (!sanitizedName) {
    throw new Error("\u9879\u76ee\u540d\u4e0d\u80fd\u4e3a\u7a7a");
  }

  if (sanitizedName === project.directoryName) {
    return project;
  }

  await requestDirectoryPermission(project.parentHandle);

  if (await directoryEntryExists(project.parentHandle, sanitizedName)) {
    throw new Error("\u8be5\u76ee\u5f55\u4e0b\u5df2\u5b58\u5728\u540c\u540d\u9879\u76ee");
  }

  const nextHandle = await project.parentHandle.getDirectoryHandle(sanitizedName, {
    create: true,
  });
  const previousRecord: PersistedProjectRecord = {
    id: project.id,
    ownerUserId: project.ownerUserId,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    directoryName: project.directoryName,
    projectHandle: project.projectHandle,
    parentHandle: project.parentHandle,
  };
  let nextRecord: PersistedProjectRecord;

  try {
    await copyDirectoryRecursive(project.projectHandle, nextHandle);

    const loadedSnapshot = await readProjectSnapshotInternal(nextHandle);
    const snapshot = loadedSnapshot.version === 2
      ? loadedSnapshot
      : await migrateLegacyProjectAtHandle(nextHandle, loadedSnapshot);
    const renamedSnapshot: ProjectManifest = {
      ...buildProjectManifestFromSnapshot(snapshot),
      name: sanitizedName,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileVerified(nextHandle, PROJECT_FILE_NAME, renamedSnapshot);

    nextRecord = {
      ...project,
      name: sanitizedName,
      updatedAt: renamedSnapshot.updatedAt,
      directoryName: sanitizedName,
      projectHandle: nextHandle,
    };

    await persistProjectRecord(nextRecord, userId);
  } catch (error) {
    await tryRemoveProjectDirectory(project.parentHandle, sanitizedName);
    throw error;
  }

  try {
    await project.parentHandle.removeEntry(project.directoryName, { recursive: true });
  } catch (error) {
    await persistProjectRecord(previousRecord, userId);
    await tryRemoveProjectDirectory(project.parentHandle, sanitizedName);
    throw error;
  }

  return {
    ...toProjectLibraryItem(nextRecord),
    projectHandle: nextHandle,
    parentHandle: project.parentHandle,
  };
}

export async function duplicateProjectDirectory(
  project: ProjectHandleRecord,
  userId: string,
): Promise<ProjectHandleRecord> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.parentHandle);
  const allProjects = await readAllProjectRecords(userId);
  const existingNames = new Set(allProjects.map((item) => item.directoryName));
  let nextName = getUniqueCopyName(project.name, existingNames);

  while (await directoryEntryExists(project.parentHandle, nextName)) {
    existingNames.add(nextName);
    nextName = getUniqueCopyName(project.name, existingNames);
  }

  const nextHandle = await project.parentHandle.getDirectoryHandle(nextName, {
    create: true,
  });

  try {
    await copyDirectoryRecursive(project.projectHandle, nextHandle);

    const loadedSourceSnapshot = await readProjectSnapshotInternal(nextHandle);
    const sourceSnapshot = loadedSourceSnapshot.version === 2
      ? loadedSourceSnapshot
      : await migrateLegacyProjectAtHandle(nextHandle, loadedSourceSnapshot);
    const timestamp = new Date().toISOString();
    const copiedSnapshot: ProjectManifest = {
      ...buildProjectManifestFromSnapshot(sourceSnapshot),
      id: crypto.randomUUID(),
      name: nextName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeJsonFileVerified(nextHandle, PROJECT_FILE_NAME, copiedSnapshot);

    const nextRecord: PersistedProjectRecord = {
      id: copiedSnapshot.id,
      ownerUserId: userId,
      name: nextName,
      createdAt: copiedSnapshot.createdAt,
      updatedAt: copiedSnapshot.updatedAt,
      directoryName: nextName,
      projectHandle: nextHandle,
      parentHandle: project.parentHandle,
    };

    await persistProjectRecord(nextRecord, userId);

    return {
      ...toProjectLibraryItem(nextRecord),
      projectHandle: nextHandle,
      parentHandle: project.parentHandle,
    };
  } catch (error) {
    await tryRemoveProjectDirectory(project.parentHandle, nextName);
    throw error;
  }
}

export async function deleteProjectDirectory(
  project: ProjectHandleRecord,
  userId: string,
): Promise<void> {
  await requireStoredProjectOwner(project, userId, {
    requireDurableVerification: true,
  });
  await requestDirectoryPermission(project.parentHandle);
  await removeProjectRecord(project.id, userId);

  try {
    await project.parentHandle.removeEntry(project.directoryName, { recursive: true });
  } catch (error) {
    await persistProjectRecord({
      id: project.id,
      ownerUserId: project.ownerUserId,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      directoryName: project.directoryName,
      projectHandle: project.projectHandle,
      parentHandle: project.parentHandle,
    }, userId);
    throw error;
  }
}

export async function persistGeneratedOutput(
  project: ProjectHandleRecord,
  params: PersistProjectOutputParams,
  userId: string,
): Promise<PersistProjectOutputResult> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.projectHandle);
  const outputHandle = await project.projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME, {
    create: true,
  });
  const blob = await readImageOutputBlob(params.imageUrl, params.fileName);
  const extension = inferExtension(params.format, blob.type);
  const safeStem = sanitizeFileStem(params.title || params.nodeData.title || "image");
  const timestamp = params.generatedAt.replace(/[:.]/g, "-");
  const manifest = await readOutputHistoryManifest(project.projectHandle);
  const existingIndex = manifest.items.findIndex((item) => item.sourceKey === params.sourceKey);
  const currentFileName =
    existingIndex >= 0 ? manifest.items[existingIndex]?.fileName : undefined;
  const fileName = await getAvailableFileName(
    outputHandle,
    `${timestamp}-${safeStem}`,
    extension,
    currentFileName,
  );

  await writeBlobFile(outputHandle, fileName, blob);

  if (existingIndex >= 0) {
    const previousFileName = currentFileName;

    if (previousFileName && previousFileName !== fileName) {
      try {
        await outputHandle.removeEntry(previousFileName);
      } catch {
        // Ignore stale file cleanup errors.
      }
    }
  }

  const nextItem: OutputHistoryManifestItem = {
    id: existingIndex >= 0 ? manifest.items[existingIndex].id : crypto.randomUUID(),
    sourceKey: compactOutputSourceKey(params.sourceKey, fileName),
    fileName,
    kind: params.kind ?? inferOutputKind(fileName, blob.type) ?? "image",
    createdAt: params.generatedAt,
    modifiedAt: new Date().toISOString(),
    mimeType: blob.type || undefined,
    sizeBytes: params.sizeBytes ?? blob.size,
    model: params.model,
    width: params.width,
    height: params.height,
    format: params.format,
    nodeData:
      "generatedImageUrl" in params.nodeData
        ? stripEmbeddedImageDataFromNodeData(params.nodeData, fileName)
        : params.nodeData,
  };

  if (existingIndex >= 0) {
    manifest.items[existingIndex] = nextItem;
  } else {
    manifest.items.push(nextItem);
  }

  await writeOutputHistoryManifest(project.projectHandle, manifest);

  const savedFileHandle = await outputHandle.getFileHandle(fileName);
  const savedFile = await savedFileHandle.getFile();

  return {
    fileName,
    previewUrl: URL.createObjectURL(savedFile),
    sizeBytes: params.sizeBytes ?? blob.size,
  };
}

async function readOutputPreviewFile(
  projectHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<File | null> {
  try {
    const outputHandle = await projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME, {
      create: true,
    });
    const fileHandle = await outputHandle.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

function isObjectUrl(value?: string): boolean {
  return typeof value === "string" && value.startsWith("blob:");
}

function resolveSourceKeyFromNode(node: CanvasNode): string | null {
  if (node.type === "image") {
    const generatedAt = node.data.generatedAt?.trim();
    const imageUrl = node.data.hostedImageUrl?.trim() || node.data.imageUrl?.trim();

    if (!generatedAt || !imageUrl) {
      return null;
    }

    return `${node.id}:${generatedAt}:${imageUrl}`;
  }

  if (node.type === "panorama-360") {
    const data = node.data.panorama360Node.panorama;
    const generatedAt = data.generatedAt?.trim();
    const imageUrl = data.generatedImageUrl?.trim();

    if (!generatedAt || !imageUrl) {
      return null;
    }

    return `${node.id}:${generatedAt}:${imageUrl}`;
  }

  if (node.type === "video_generation") {
    const generatedAt = node.data.generatedAt?.trim();
    const videoUrl = node.data.hostedVideoUrl?.trim() || node.data.videoUrl?.trim();

    if (!generatedAt || !videoUrl) {
      return null;
    }

    return `${node.id}:${generatedAt}:${videoUrl}`;
  }

  if (node.type === "video") {
    const outputFileName = node.data.outputFileName?.trim();
    const videoUrl = node.data.hostedVideoUrl?.trim() || node.data.videoUrl?.trim();

    if (outputFileName) {
      return `${node.id}:output:${outputFileName}`;
    }

    if (!videoUrl) {
      return null;
    }

    return `${node.id}:video:${videoUrl}`;
  }

  if (node.type === "audio_generation") {
    const generatedAt = node.data.generatedAt?.trim();
    const audioUrl = node.data.hostedAudioUrl?.trim() || node.data.audioUrl?.trim();

    if (!generatedAt || !audioUrl) {
      return null;
    }

    return `${node.id}:${generatedAt}:${audioUrl}`;
  }

  if (node.type === "audio") {
    const outputFileName = node.data.outputFileName?.trim();
    const audioUrl = node.data.hostedAudioUrl?.trim() || node.data.audioUrl.trim();

    if (outputFileName) {
      return `${node.id}:output:${outputFileName}`;
    }

    if (!audioUrl) {
      return null;
    }

    return `${node.id}:audio:${audioUrl}`;
  }

  if (node.type !== "image_generation") {
    return null;
  }

  const data = node.data;
  const generatedAt = data.generatedAt?.trim();
  const imageUrl = data.generatedImageUrl?.trim();

  if (!generatedAt || !imageUrl) {
    return null;
  }

  return `${node.id}:${generatedAt}:${imageUrl}`;
}

function resolveOutputFileNameFromMaterial(item: MaterialLibraryItem): string | null {
  const outputFileName = item.outputFileName?.trim();

  if (outputFileName) {
    return outputFileName;
  }

  const fileName = item.fileName?.trim();
  const sourceUrl = item.mediaUrl?.trim() || item.imageUrl.trim();

  if (fileName && sourceUrl === `output:${fileName}`) {
    return fileName;
  }

  return null;
}

function withResolvedPreviewUrl(
  previewUrl: string,
  fileName: string,
  nodeData: ImageGenerationNodeData,
): ImageGenerationNodeData {
  const nextResults = nodeData.generationResults?.map((result) => {
    if (result.status !== "completed") {
      return result;
    }

    const matchesCurrent =
      result.generatedAt === nodeData.generatedAt &&
      result.imageUrl === nodeData.generatedImageUrl;

    if (!matchesCurrent) {
      return result;
    }

    return {
      ...result,
      hostedImageUrl: previewUrl,
    };
  });

  return {
    ...nodeData,
    generatedHostedImageUrl: previewUrl,
    generatedOutputFileName: fileName,
    generationResults: nextResults,
  };
}

function withResolvedVideoPreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "video_generation" }>,
): Extract<CanvasNode, { type: "video_generation" }> {
  return {
    ...node,
    data: {
      ...node.data,
      videoUrl: previewUrl,
      hostedVideoUrl: previewUrl,
      generatedOutputFileName: fileName,
    },
  };
}

function withResolvedVideoNodePreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "video" }>,
): Extract<CanvasNode, { type: "video" }> {
  return {
    ...node,
    data: {
      ...node.data,
      videoUrl: previewUrl,
      hostedVideoUrl: previewUrl,
      fileName: node.data.fileName ?? fileName,
      outputFileName: fileName,
    },
  };
}

export function withResolvedAudioGenerationPreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "audio_generation" }>,
): Extract<CanvasNode, { type: "audio_generation" }> {
  return {
    ...node,
    data: {
      ...node.data,
      audioUrl: previewUrl,
      previewUrl,
      hostedAudioUrl: isObjectUrl(node.data.hostedAudioUrl) ? undefined : node.data.hostedAudioUrl,
      generatedOutputFileName: fileName,
    },
  };
}

export function withResolvedAudioNodePreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "audio" }>,
): Extract<CanvasNode, { type: "audio" }> {
  return {
    ...node,
    data: {
      ...node.data,
      audioUrl: previewUrl,
      previewUrl,
      hostedAudioUrl: isObjectUrl(node.data.hostedAudioUrl) ? undefined : node.data.hostedAudioUrl,
      fileName: node.data.fileName ?? fileName,
      outputFileName: fileName,
    },
  };
}

function withResolvedPanoramaPreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "panorama-360" }>,
): Extract<CanvasNode, { type: "panorama-360" }> {
  return {
    ...node,
    data: {
      ...node.data,
      panorama360Node: {
        ...node.data.panorama360Node,
        panorama: {
          ...node.data.panorama360Node.panorama,
          generatedHostedImageUrl: previewUrl,
          generatedOutputFileName: fileName,
        },
      },
    },
  };
}

function resolveUploadedImageOutputFileName(
  node: Extract<CanvasNode, { type: "uploaded_image" }>,
): string | null {
  const fileName = node.data.outputFileName?.trim();

  if (!fileName) {
    return null;
  }

  const imageUrl = node.data.imageUrl.trim();

  if (!imageUrl || imageUrl === `output:${fileName}`) {
    return fileName;
  }

  return null;
}

function resolveVideoOutputFileName(
  node: Extract<CanvasNode, { type: "video" }>,
): string | null {
  const fileName = node.data.outputFileName?.trim();

  if (!fileName) {
    return null;
  }

  const videoUrl = node.data.videoUrl.trim();

  if (!videoUrl || videoUrl === `output:${fileName}`) {
    return fileName;
  }

  return fileName;
}

function resolveAudioOutputFileName(
  node: Extract<CanvasNode, { type: "audio" }>,
): string | null {
  const fileName = node.data.outputFileName?.trim();

  if (!fileName) {
    return null;
  }

  const audioUrl = node.data.audioUrl.trim();

  if (!audioUrl || audioUrl === `output:${fileName}`) {
    return fileName;
  }

  return fileName;
}

export function withResolvedUploadedImagePreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "uploaded_image" }>,
): Extract<CanvasNode, { type: "uploaded_image" }> {
  return {
    ...node,
    data: {
      ...node.data,
      imageUrl: previewUrl,
      hostedImageUrl: isObjectUrl(node.data.hostedImageUrl)
        ? undefined
        : node.data.hostedImageUrl,
      previewUrl,
      fileName: node.data.fileName ?? fileName,
      outputFileName: fileName,
    },
  };
}

export function withResolvedImagePreviewUrl(
  previewUrl: string,
  fileName: string,
  node: Extract<CanvasNode, { type: "image" }>,
): Extract<CanvasNode, { type: "image" }> {
  return {
    ...node,
    data: {
      ...node.data,
      imageUrl: previewUrl,
      hostedImageUrl: isObjectUrl(node.data.hostedImageUrl)
        ? undefined
        : node.data.hostedImageUrl,
      previewUrl,
      generatedOutputFileName: fileName,
    },
  };
}

export async function hydrateProjectSnapshotPreviewUrls(
  project: ProjectHandleRecord,
  snapshot: ProjectSnapshot,
  userId: string,
): Promise<{ snapshot: ProjectSnapshot; previewUrls: string[] }> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.projectHandle, false);

  const manifest = await readOutputHistoryManifest(project.projectHandle);
  const fileNameBySourceKey = new Map<string, string>();
  const latestVideoFileNameByNodeId = new Map<string, string>();
  const latestAudioFileNameByNodeId = new Map<string, string>();

  for (const item of manifest.items) {
    if (item.sourceKey?.trim()) {
      fileNameBySourceKey.set(item.sourceKey, item.fileName);
    }

    if (item.kind === "video" && item.sourceKey?.trim()) {
      const nodeId = item.sourceKey.split(":")[0];
      const currentFileName = latestVideoFileNameByNodeId.get(nodeId);
      const currentItem = currentFileName
        ? manifest.items.find((candidate) => candidate.fileName === currentFileName)
        : undefined;
      const currentTime = currentItem
        ? new Date(currentItem.modifiedAt || currentItem.createdAt).getTime()
        : -Infinity;
      const nextTime = new Date(item.modifiedAt || item.createdAt).getTime();

      if (nodeId && nextTime >= currentTime) {
        latestVideoFileNameByNodeId.set(nodeId, item.fileName);
      }
    }

    if (item.kind === "audio" && item.sourceKey?.trim()) {
      const nodeId = item.sourceKey.split(":")[0];
      const currentFileName = latestAudioFileNameByNodeId.get(nodeId);
      const currentItem = currentFileName
        ? manifest.items.find((candidate) => candidate.fileName === currentFileName)
        : undefined;
      const currentTime = currentItem
        ? new Date(currentItem.modifiedAt || currentItem.createdAt).getTime()
        : -Infinity;
      const nextTime = new Date(item.modifiedAt || item.createdAt).getTime();

      if (nodeId && nextTime >= currentTime) {
        latestAudioFileNameByNodeId.set(nodeId, item.fileName);
      }
    }
  }

  const previewUrls: string[] = [];
  const materials = await Promise.all(
    (snapshot.materials ?? []).map(async (item) => {
      const fileName = resolveOutputFileNameFromMaterial(item);

      if (!fileName) {
        return item;
      }

      const file = await readOutputPreviewFile(project.projectHandle, fileName);

      if (!file) {
        return item;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.push(previewUrl);
      const kind = getMaterialKind(item);

      return {
        ...item,
        kind,
        mediaUrl: previewUrl,
        hostedMediaUrl: kind === "image" ? undefined : previewUrl,
        previewUrl,
        imageUrl: previewUrl,
        hostedImageUrl: kind === "image" ? previewUrl : undefined,
        outputFileName: fileName,
        fileName: item.fileName ?? fileName,
      };
    }),
  );
  const nodes = await Promise.all(
    snapshot.nodes.map(async (node) => {
      const sourceKey = resolveSourceKeyFromNode(node);
      const fileName = node.type === "image_generation"
        ? node.data.generatedOutputFileName?.trim() ||
          (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined)
        : node.type === "video_generation"
          ? node.data.generatedOutputFileName?.trim() ||
            (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined) ||
            latestVideoFileNameByNodeId.get(node.id)
        : node.type === "video"
          ? resolveVideoOutputFileName(node) ||
            (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined) ||
            latestVideoFileNameByNodeId.get(node.id)
        : node.type === "audio_generation"
          ? node.data.generatedOutputFileName?.trim() ||
            (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined) ||
            latestAudioFileNameByNodeId.get(node.id)
        : node.type === "audio"
          ? resolveAudioOutputFileName(node) ||
            (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined) ||
            latestAudioFileNameByNodeId.get(node.id)
        : node.type === "panorama-360"
          ? node.data.panorama360Node.panorama.generatedOutputFileName?.trim() ||
            (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined)
          : node.type === "image"
            ? node.data.generatedOutputFileName?.trim() ||
              (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined)
          : node.type === "uploaded_image"
            ? resolveUploadedImageOutputFileName(node)
          : undefined;

      if (!fileName) {
        return node;
      }

      const file = await readOutputPreviewFile(project.projectHandle, fileName);

      if (!file) {
        return node;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.push(previewUrl);

      if (node.type === "panorama-360") {
        return withResolvedPanoramaPreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "image_generation") {
        return {
          ...node,
          data: withResolvedPreviewUrl(previewUrl, fileName, node.data),
        };
      }

      if (node.type === "video_generation") {
        return withResolvedVideoPreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "video") {
        return withResolvedVideoNodePreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "audio_generation") {
        return withResolvedAudioGenerationPreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "audio") {
        return withResolvedAudioNodePreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "image") {
        return withResolvedImagePreviewUrl(previewUrl, fileName, node);
      }

      if (node.type === "uploaded_image") {
        return withResolvedUploadedImagePreviewUrl(previewUrl, fileName, node);
      }

      return node;
    }),
  );

  return {
    snapshot: {
      ...snapshot,
      nodes,
      materials,
    },
    previewUrls,
  };
}

export function revokeObjectUrls(urls: string[]): void {
  for (const url of urls) {
    if (isObjectUrl(url)) {
      URL.revokeObjectURL(url);
    }
  }
}

export async function readProjectHistory(
  project: ProjectHandleRecord,
  userId: string,
): Promise<ProjectOutputHistoryItem[]> {
  await requireStoredProjectOwner(project, userId);
  await requestDirectoryPermission(project.projectHandle, false);
  const outputHandle = await project.projectHandle.getDirectoryHandle(OUTPUT_DIRECTORY_NAME, {
    create: true,
  });
  const manifest = await readOutputHistoryManifest(project.projectHandle);
  const manifestByFileName = new Map(
    manifest.items.map((item) => [item.fileName, item] as const),
  );
  const items: ProjectOutputHistoryItem[] = [];

  for await (const [entryName, entryHandle] of outputHandle.entries()) {
    if (entryHandle.kind !== "file" || entryName === OUTPUT_HISTORY_FILE_NAME) {
      continue;
    }

    const file = await entryHandle.getFile();
    const kind = inferOutputKind(file.name, file.type);

    if (!kind) {
      continue;
    }

    const manifestItem = manifestByFileName.get(file.name);
    const previewUrl = URL.createObjectURL(file);

    const baseItem = {
      id: manifestItem?.id ?? crypto.randomUUID(),
      sourceKey: manifestItem?.sourceKey,
      fileName: file.name,
      previewUrl,
      createdAt:
        manifestItem?.createdAt ||
        (file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()),
      modifiedAt:
        manifestItem?.modifiedAt ||
        (file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()),
      mimeType: file.type || manifestItem?.mimeType,
      sizeBytes: manifestItem?.sizeBytes ?? file.size,
      model: manifestItem?.model,
      width: manifestItem?.width,
      height: manifestItem?.height,
      format: manifestItem?.format,
    };

    items.push(
      kind === "image"
        ? {
            ...baseItem,
            kind,
            nodeData: isImageHistoryManifestItem(manifestItem)
              ? (manifestItem.nodeData as ImageGenerationNodeData | undefined)
              : undefined,
          }
        : kind === "video"
          ? {
            ...baseItem,
            kind,
            nodeData: isVideoHistoryManifestItem(manifestItem)
              ? (manifestItem.nodeData as VideoGenerationNodeData | undefined)
              : undefined,
          }
          : {
            ...baseItem,
            kind,
            nodeData: isAudioHistoryManifestItem(manifestItem)
              ? (manifestItem.nodeData as AudioGenerationNodeData | AudioNodeData | undefined)
              : undefined,
          },
    );
  }

  return items.sort(
    (left, right) =>
      new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime(),
  );
}

export function revokeProjectHistoryItems(items: ProjectOutputHistoryItem[]): void {
  for (const item of items) {
    URL.revokeObjectURL(item.previewUrl);
  }
}
