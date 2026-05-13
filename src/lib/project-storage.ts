'use client';

import type {
  CanvasNode,
  ImageGenerationNodeData,
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

function sanitizeFileStem(value?: string): string {
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

function inferExtension(format?: string, mimeType?: string): string {
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

function ensureFileSystemAccessSupport(): void {
  if (
    typeof window === "undefined" ||
    typeof window.indexedDB === "undefined" ||
    typeof window.showDirectoryPicker !== "function"
  ) {
    throw new Error("当前环境不支持项目文件系统访问");
  }
}

function openProjectDb(): Promise<IDBDatabase> {
  ensureFileSystemAccessSupport();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("项目库初始化失败"));
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
          reject(transaction.error ?? new Error("项目库操作失败"));
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
    request.onerror = () => reject(request.error ?? new Error("项目库读取失败"));
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
    throw new Error("未获得目录访问权限");
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
  await writeTextFile(
    outputHandle,
    OUTPUT_HISTORY_FILE_NAME,
    JSON.stringify(manifest, null, 2),
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
    throw new Error("项目文件损坏，无法读取");
  }

  return parsed;
}

function getUniqueCopyName(baseName: string, existingNames: Set<string>): string {
  const preferred = `${baseName} - 副本`;

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
    throw new Error("项目名不能为空");
  }

  await requestDirectoryPermission(params.parentHandle);

  if (await directoryEntryExists(params.parentHandle, sanitizedName)) {
    throw new Error("该目录下已存在同名项目");
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
      validProjects.push({
        ...toProjectLibraryItem(record),
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
    throw new Error("项目名不能为空");
  }

  if (sanitizedName === project.directoryName) {
    return project;
  }

  await requestDirectoryPermission(project.parentHandle);

  if (await directoryEntryExists(project.parentHandle, sanitizedName)) {
    throw new Error("该目录下已存在同名项目");
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
  const response = await fetch(params.imageUrl);

  if (!response.ok) {
    throw new Error("生成结果写入项目目录失败");
  }

  const blob = await response.blob();
  const extension = inferExtension(params.format, blob.type);
  const safeStem = sanitizeFileStem(params.title || params.nodeData.title || "image");
  const timestamp = params.generatedAt.replace(/[:.]/g, "-");
  const fileName = `${timestamp}-${safeStem}.${extension}`;

  await writeBlobFile(outputHandle, fileName, blob);

  const manifest = await readOutputHistoryManifest(project.projectHandle);
  const existingIndex = manifest.items.findIndex((item) => item.sourceKey === params.sourceKey);

  if (existingIndex >= 0) {
    const previousFileName = manifest.items[existingIndex]?.fileName;

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
    sourceKey: params.sourceKey,
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
    nodeData: params.nodeData,
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
