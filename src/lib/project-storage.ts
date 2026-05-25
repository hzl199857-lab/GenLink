'use client';

import type {
  CanvasNode,
  ImageGenerationNodeData,
  MaterialLibraryCategory,
  MaterialLibraryItem,
  ProjectOutputHistoryItem,
  ProjectSnapshot,
} from "@/types/canvas";
import { buildProjectSnapshot } from "@/lib/project-snapshot";

const PROJECT_DB_NAME = "genlink-project-library";
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE_NAME = "projects";
const PROJECT_FILE_NAME = "project.json";
const OUTPUT_DIRECTORY_NAME = "output";
const OUTPUT_HISTORY_FILE_NAME = "history.json";
const THUMBNAIL_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

type PersistedProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  directoryName: string;
  projectHandle: FileSystemDirectoryHandle;
  parentHandle: FileSystemDirectoryHandle;
};

type OutputHistoryManifestItem = {
  id: string;
  sourceKey?: string;
  fileName: string;
  kind: "image" | "video";
  createdAt: string;
  modifiedAt: string;
  mimeType?: string;
  sizeBytes?: number;
  model?: string;
  width?: number;
  height?: number;
  format?: string;
  nodeData?: ImageGenerationNodeData;
};

type OutputHistoryManifest = {
  items: OutputHistoryManifestItem[];
};

export interface ProjectLibraryItem {
  id: string;
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
  fileName?: string;
  generatedAt: string;
  nodeData: ImageGenerationNodeData;
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
}

function toProjectLibraryItem(
  record: PersistedProjectRecord,
): ProjectLibraryItem {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    directoryName: record.directoryName,
  };
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
    default:
      return "png";
  }
}

function inferOutputKind(
  fileName: string,
  mimeType?: string,
): "image" | "video" | null {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (normalizedMimeType?.startsWith("image/")) {
    return "image";
  }

  if (normalizedMimeType?.startsWith("video/")) {
    return "video";
  }

  const lowerFileName = fileName.toLowerCase();

  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(lowerFileName)) {
    return "image";
  }

  if (/\.(mp4|webm|mov|m4v)$/.test(lowerFileName)) {
    return "video";
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
    value === "其他"
    ? value
    : null;
}

function normalizeMaterialLibraryItems(value: unknown): MaterialLibraryItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.flatMap((item, index): MaterialLibraryItem[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const category = normalizeMaterialCategory(record.category);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";

    if (!category || !name || !imageUrl) {
      return [];
    }

    return [{
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `material-${index}`,
      name,
      category,
      imageUrl,
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
        record.sourceNodeType === "uploaded_image"
          ? record.sourceNodeType
          : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
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
    effectivePromptOverride: undefined,
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

async function readRemoteImageBlobViaProxy(imageUrl: string): Promise<Blob> {
  const response = await fetch("/api/image-hosting/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    throw new Error("Failed to read generated image");
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
      throw new Error("Failed to read generated image");
    }

    return await response.blob();
  } catch {
    if (trimmedImageUrl.startsWith("blob:")) {
      throw new Error("Failed to read generated image");
    }

    if (/^https?:\/\//i.test(trimmedImageUrl)) {
      try {
        return await readRemoteImageBlobViaProxy(trimmedImageUrl);
      } catch {
        // Fall back to hosting first for URLs that need server-side normalization.
      }
    }

    const hostedImageUrl = await hostImageUrlForBrowserRead(trimmedImageUrl, fileName);
    const response = await fetch(hostedImageUrl);

    if (!response.ok) {
      try {
        return await readRemoteImageBlobViaProxy(hostedImageUrl);
      } catch {
        // Fall through to the existing user-facing save error.
      }

      throw new Error("Failed to read hosted generated image");
    }

    return response.blob();
  }
}

function ensureFileSystemAccessSupport(): void {
  if (
    typeof window === "undefined" ||
    typeof window.indexedDB === "undefined" ||
    typeof window.showDirectoryPicker !== "function"
  ) {
    throw new Error("\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u9879\u76ee\u6587\u4ef6\u7cfb\u7edf\u8bbf\u95ee");
  }
}

function openProjectDb(): Promise<IDBDatabase> {
  ensureFileSystemAccessSupport();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("\u9879\u76ee\u5e93\u521d\u59cb\u5316\u5931\u8d25"));
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        database.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withProjectStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const database = await openProjectDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE_NAME, mode);
    const store = transaction.objectStore(PROJECT_STORE_NAME);

    Promise.resolve(run(store))
      .then((value) => {
        transaction.oncomplete = () => {
          database.close();
          resolve(value);
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("\u9879\u76ee\u5e93\u64cd\u4f5c\u5931\u8d25"));
        };
      })
      .catch((error) => {
        database.close();
        reject(error);
      });
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("\u9879\u76ee\u5e93\u8bfb\u53d6\u5931\u8d25"));
  });
}

async function persistProjectRecord(
  record: PersistedProjectRecord,
): Promise<void> {
  await withProjectStore("readwrite", async (store) => {
    await requestAsPromise(store.put(record));
  });
}

async function removeProjectRecord(projectId: string): Promise<void> {
  await withProjectStore("readwrite", async (store) => {
    await requestAsPromise(store.delete(projectId));
  });
}

async function readAllProjectRecords(): Promise<PersistedProjectRecord[]> {
  return withProjectStore("readonly", async (store) => {
    const request = store.getAll();
    const result = await requestAsPromise(request);
    return (result as PersistedProjectRecord[]) ?? [];
  });
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
          (item.kind === "image" || item.kind === "video"),
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
        ? stripEmbeddedImageDataFromNodeData(item.nodeData, item.fileName)
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
  await writeTextFile(projectHandle, PROJECT_FILE_NAME, JSON.stringify(snapshot, null, 2));
}

async function readProjectSnapshotInternal(
  projectHandle: FileSystemDirectoryHandle,
): Promise<ProjectSnapshot> {
  const text = await readTextFile(projectHandle, PROJECT_FILE_NAME);
  const parsed = JSON.parse(text) as ProjectSnapshot;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.id !== "string" ||
    typeof parsed.name !== "string" ||
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new Error("\u9879\u76ee\u6587\u4ef6\u635f\u574f\uff0c\u65e0\u6cd5\u8bfb\u53d6");
  }

  return {
    ...parsed,
    materials: normalizeMaterialLibraryItems(parsed.materials),
  };
}

async function findFirstImageFileRecursive(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<File | null> {
  for await (const [entryName, entryHandle] of directoryHandle.entries()) {
    if (entryHandle.kind === "file") {
      const file = await entryHandle.getFile();

      if (isThumbnailImageFile(file)) {
        return file;
      }

      continue;
    }

    if (entryName === "." || entryName === "..") {
      continue;
    }

    const nestedFile = await findFirstImageFileRecursive(entryHandle);

    if (nestedFile) {
      return nestedFile;
    }
  }

  return null;
}

async function readProjectThumbnailUrl(
  projectHandle: FileSystemDirectoryHandle,
): Promise<string | undefined> {
  try {
    const file = await findFirstImageFileRecursive(projectHandle);
    return file ? URL.createObjectURL(file) : undefined;
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
  ensureFileSystemAccessSupport();
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await requestDirectoryPermission(handle);
  return handle;
}

export async function createProjectAtParentDirectory(params: {
  parentHandle: FileSystemDirectoryHandle;
  projectName: string;
}): Promise<CreateProjectResult> {
  const sanitizedName = sanitizeDirectoryName(params.projectName);

  if (!sanitizedName) {
    throw new Error("\u9879\u76ee\u540d\u4e0d\u80fd\u4e3a\u7a7a");
  }

  await requestDirectoryPermission(params.parentHandle);

  if (await directoryEntryExists(params.parentHandle, sanitizedName)) {
    throw new Error("\u8be5\u76ee\u5f55\u4e0b\u5df2\u5b58\u5728\u540c\u540d\u9879\u76ee");
  }

  const timestamp = new Date().toISOString();
  const snapshot = buildProjectSnapshot({
    id: crypto.randomUUID(),
    name: sanitizedName,
    nodes: [],
    edges: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const projectHandle = await params.parentHandle.getDirectoryHandle(sanitizedName, {
    create: true,
  });

  try {
    await createProjectDirectorySkeleton(projectHandle, snapshot);

    const record: PersistedProjectRecord = {
      id: snapshot.id,
      name: sanitizedName,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      directoryName: sanitizedName,
      projectHandle,
      parentHandle: params.parentHandle,
    };

    await persistProjectRecord(record);

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
): Promise<ImportProjectsResult> {
  await requestDirectoryPermission(parentHandle);

  const importedProjects: ProjectHandleRecord[] = [];
  let skippedCount = 0;

  try {
    const snapshot = await readProjectSnapshotInternal(parentHandle);
    const timestamp = new Date().toISOString();
    const projectName = sanitizeDirectoryName(snapshot.name || parentHandle.name);
    const record: PersistedProjectRecord = {
      id: snapshot.id,
      name: projectName || parentHandle.name,
      createdAt: snapshot.createdAt || timestamp,
      updatedAt: snapshot.updatedAt || timestamp,
      directoryName: parentHandle.name,
      projectHandle: parentHandle,
      parentHandle,
    };

    await persistProjectRecord(record);

    return {
      projects: [{
        ...toProjectLibraryItem(record),
        projectHandle: parentHandle,
        parentHandle,
      }],
      skippedCount,
    };
  } catch {
    // If the selected directory is not itself a project, scan its children.
  }

  const iterableParent = parentHandle as FileSystemDirectoryHandle & {
    values: () => AsyncIterable<FileSystemHandle>;
  };

  for await (const childHandle of iterableParent.values()) {
    if (childHandle.kind !== "directory") {
      continue;
    }

    const projectHandle = childHandle as FileSystemDirectoryHandle;

    try {
      await requestDirectoryPermission(projectHandle, false);
      const snapshot = await readProjectSnapshotInternal(projectHandle);
      const timestamp = new Date().toISOString();
      const projectName = sanitizeDirectoryName(snapshot.name || projectHandle.name);
      const record: PersistedProjectRecord = {
        id: snapshot.id,
        name: projectName || projectHandle.name,
        createdAt: snapshot.createdAt || timestamp,
        updatedAt: snapshot.updatedAt || timestamp,
        directoryName: projectHandle.name,
        projectHandle,
        parentHandle,
      };

      await persistProjectRecord(record);
      importedProjects.push({
        ...toProjectLibraryItem(record),
        projectHandle,
        parentHandle,
      });
    } catch {
      skippedCount += 1;
    }
  }

  return {
    projects: sortProjects(importedProjects),
    skippedCount,
  };
}

export async function loadProjectSnapshot(
  project: ProjectHandleRecord,
): Promise<ProjectSnapshot> {
  await requestDirectoryPermission(project.projectHandle, false);
  return readProjectSnapshotInternal(project.projectHandle);
}

export async function saveProjectSnapshot(
  project: ProjectHandleRecord,
  snapshot: ProjectSnapshot,
): Promise<ProjectHandleRecord> {
  await requestDirectoryPermission(project.projectHandle);

  const nextSnapshot = buildProjectSnapshot({
    ...snapshot,
    name: project.name,
    updatedAt: new Date().toISOString(),
  });

  await writeTextFile(
    project.projectHandle,
    PROJECT_FILE_NAME,
    JSON.stringify(nextSnapshot, null, 2),
  );

  const nextRecord: PersistedProjectRecord = {
    ...project,
    name: project.name,
    updatedAt: nextSnapshot.updatedAt,
  };

  await persistProjectRecord(nextRecord);

  return {
    ...toProjectLibraryItem(nextRecord),
    projectHandle: project.projectHandle,
    parentHandle: project.parentHandle,
  };
}

export async function listProjectLibrary(): Promise<ProjectHandleRecord[]> {
  const records = await readAllProjectRecords();
  const validProjects: ProjectHandleRecord[] = [];
  const invalidProjectIds: string[] = [];

  for (const record of sortProjects(records)) {
    try {
      await requestDirectoryPermission(record.projectHandle, false);
      await readProjectSnapshotInternal(record.projectHandle);
      const thumbnailUrl = await readProjectThumbnailUrl(record.projectHandle);
      validProjects.push({
        ...toProjectLibraryItem(record),
        thumbnailUrl,
        projectHandle: record.projectHandle,
        parentHandle: record.parentHandle,
      });
    } catch {
      invalidProjectIds.push(record.id);
    }
  }

  await Promise.all(invalidProjectIds.map((projectId) => removeProjectRecord(projectId)));

  return validProjects;
}

export async function renameProjectDirectory(
  project: ProjectHandleRecord,
  nextName: string,
): Promise<ProjectHandleRecord> {
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

  try {
    await copyDirectoryRecursive(project.projectHandle, nextHandle);

    const snapshot = await readProjectSnapshotInternal(nextHandle);
    const renamedSnapshot = buildProjectSnapshot({
      ...snapshot,
      name: sanitizedName,
      createdAt: snapshot.createdAt,
      updatedAt: new Date().toISOString(),
    });

    await writeTextFile(
      nextHandle,
      PROJECT_FILE_NAME,
      JSON.stringify(renamedSnapshot, null, 2),
    );

    await project.parentHandle.removeEntry(project.directoryName, { recursive: true });

    const nextRecord: PersistedProjectRecord = {
      ...project,
      name: sanitizedName,
      updatedAt: renamedSnapshot.updatedAt,
      directoryName: sanitizedName,
      projectHandle: nextHandle,
    };

    await persistProjectRecord(nextRecord);

    return {
      ...toProjectLibraryItem(nextRecord),
      projectHandle: nextHandle,
      parentHandle: project.parentHandle,
    };
  } catch (error) {
    await tryRemoveProjectDirectory(project.parentHandle, sanitizedName);
    throw error;
  }
}

export async function duplicateProjectDirectory(
  project: ProjectHandleRecord,
): Promise<ProjectHandleRecord> {
  await requestDirectoryPermission(project.parentHandle);
  const allProjects = await readAllProjectRecords();
  const existingNames = new Set(allProjects.map((item) => item.directoryName));
  const nextName = getUniqueCopyName(project.name, existingNames);
  const nextHandle = await project.parentHandle.getDirectoryHandle(nextName, {
    create: true,
  });

  try {
    await copyDirectoryRecursive(project.projectHandle, nextHandle);

    const sourceSnapshot = await readProjectSnapshotInternal(nextHandle);
    const timestamp = new Date().toISOString();
    const copiedSnapshot = buildProjectSnapshot({
      ...sourceSnapshot,
      id: crypto.randomUUID(),
      name: nextName,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await writeTextFile(
      nextHandle,
      PROJECT_FILE_NAME,
      JSON.stringify(copiedSnapshot, null, 2),
    );

    const nextRecord: PersistedProjectRecord = {
      id: copiedSnapshot.id,
      name: nextName,
      createdAt: copiedSnapshot.createdAt,
      updatedAt: copiedSnapshot.updatedAt,
      directoryName: nextName,
      projectHandle: nextHandle,
      parentHandle: project.parentHandle,
    };

    await persistProjectRecord(nextRecord);

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
): Promise<void> {
  await requestDirectoryPermission(project.parentHandle);
  await project.parentHandle.removeEntry(project.directoryName, { recursive: true });
  await removeProjectRecord(project.id);
}

export async function persistGeneratedOutput(
  project: ProjectHandleRecord,
  params: PersistProjectOutputParams,
): Promise<PersistProjectOutputResult> {
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
    kind: "image",
    createdAt: params.generatedAt,
    modifiedAt: new Date().toISOString(),
    mimeType: blob.type || undefined,
    sizeBytes: params.sizeBytes ?? blob.size,
    model: params.model,
    width: params.width,
    height: params.height,
    format: params.format,
    nodeData: stripEmbeddedImageDataFromNodeData(params.nodeData, fileName),
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
  const sourceUrl = item.imageUrl.trim();

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

export async function hydrateProjectSnapshotPreviewUrls(
  project: ProjectHandleRecord,
  snapshot: ProjectSnapshot,
): Promise<{ snapshot: ProjectSnapshot; previewUrls: string[] }> {
  await requestDirectoryPermission(project.projectHandle, false);

  const manifest = await readOutputHistoryManifest(project.projectHandle);
  const fileNameBySourceKey = new Map<string, string>();

  for (const item of manifest.items) {
    if (item.sourceKey?.trim()) {
      fileNameBySourceKey.set(item.sourceKey, item.fileName);
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

      return {
        ...item,
        imageUrl: previewUrl,
        hostedImageUrl: previewUrl,
        outputFileName: fileName,
        fileName: item.fileName ?? fileName,
      };
    }),
  );
  const nodes = await Promise.all(
    snapshot.nodes.map(async (node) => {
      if (node.type !== "image_generation") {
        return node;
      }

      const sourceKey = resolveSourceKeyFromNode(node);
      const fileName =
        node.data.generatedOutputFileName?.trim() ||
        (sourceKey ? fileNameBySourceKey.get(sourceKey) : undefined);

      if (!fileName) {
        return node;
      }

      const file = await readOutputPreviewFile(project.projectHandle, fileName);

      if (!file) {
        return node;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.push(previewUrl);

      return {
        ...node,
        data: withResolvedPreviewUrl(previewUrl, fileName, node.data),
      };
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
): Promise<ProjectOutputHistoryItem[]> {
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

    items.push({
      id: manifestItem?.id ?? crypto.randomUUID(),
      sourceKey: manifestItem?.sourceKey,
      fileName: file.name,
      kind,
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
      nodeData: manifestItem?.nodeData,
    });
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
