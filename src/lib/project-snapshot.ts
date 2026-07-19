import type {
  CanvasDocument,
  CanvasEdge,
  CanvasNode,
  CanvasViewport,
  MaterialLibraryFolder,
  MaterialLibraryItem,
  NodeGroup,
  ProjectCanvasMetadata,
  ProjectManifest,
  ProjectSnapshot,
} from "@/types/canvas";

const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

function getSnapshotCanvasMetadata(snapshot: ProjectSnapshot): ProjectCanvasMetadata {
  const activeCanvas = snapshot.canvases?.find((canvas) => canvas.id === snapshot.activeCanvasId)
    ?? snapshot.canvases?.[0];

  if (activeCanvas) {
    return activeCanvas;
  }

  const canvasId = snapshot.activeCanvasId?.trim() || crypto.randomUUID();

  return {
    id: canvasId,
    name: "画布 1",
    fileName: `${canvasId}.json`,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

interface BuildProjectSnapshotParams {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: NodeGroup[];
  materialFolders?: MaterialLibraryFolder[];
  materials?: MaterialLibraryItem[];
  thumbnailFileName?: string;
  createdAt?: string;
  updatedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function buildProjectSnapshot({
  id,
  name,
  nodes,
  edges,
  groups,
  materialFolders,
  materials,
  thumbnailFileName,
  createdAt,
  updatedAt,
}: BuildProjectSnapshotParams): ProjectSnapshot {
  const nextCreatedAt = createdAt?.trim() || nowIso();
  const nextUpdatedAt = updatedAt?.trim() || nowIso();

  return {
    id,
    name: name.trim() || "Untitled",
    nodes,
    edges,
    groups: groups && groups.length > 0 ? groups : undefined,
    materialFolders: materialFolders && materialFolders.length > 0 ? materialFolders : undefined,
    materials: materials && materials.length > 0 ? materials : undefined,
    thumbnailFileName: thumbnailFileName?.trim() || undefined,
    createdAt: nextCreatedAt,
    updatedAt: nextUpdatedAt,
  };
}

export function buildProjectManifestFromSnapshot(snapshot: ProjectSnapshot): ProjectManifest {
  const activeCanvas = getSnapshotCanvasMetadata(snapshot);
  const canvases = snapshot.canvases?.length ? snapshot.canvases : [activeCanvas];

  return {
    version: 2,
    id: snapshot.id,
    name: snapshot.name.trim() || "Untitled",
    canvases: canvases.map((canvas) => ({ ...canvas })),
    materialFolders: snapshot.materialFolders?.length ? snapshot.materialFolders : undefined,
    materials: snapshot.materials?.length ? snapshot.materials : undefined,
    thumbnailFileName: snapshot.thumbnailFileName?.trim() || undefined,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

export function buildCanvasDocumentFromSnapshot(snapshot: ProjectSnapshot): CanvasDocument {
  const activeCanvas = getSnapshotCanvasMetadata(snapshot);

  return {
    version: 1,
    id: activeCanvas.id,
    name: activeCanvas.name,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    groups: snapshot.groups?.length ? snapshot.groups : undefined,
    viewport: snapshot.viewport ? { ...snapshot.viewport } : { ...DEFAULT_VIEWPORT },
    createdAt: activeCanvas.createdAt,
    updatedAt: snapshot.updatedAt || activeCanvas.updatedAt,
  };
}

export function mergeProjectManifestAndCanvas(
  manifest: ProjectManifest,
  canvas: CanvasDocument,
): ProjectSnapshot {
  return {
    version: 2,
    id: manifest.id,
    name: manifest.name,
    canvases: manifest.canvases.map((item) => ({ ...item })),
    activeCanvasId: canvas.id,
    nodes: canvas.nodes,
    edges: canvas.edges,
    groups: canvas.groups,
    viewport: { ...canvas.viewport },
    materialFolders: manifest.materialFolders,
    materials: manifest.materials,
    thumbnailFileName: manifest.thumbnailFileName,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

export function getProjectSnapshotSignature(
  value: Pick<ProjectSnapshot, "name" | "nodes" | "edges" | "groups" | "materialFolders" | "materials">,
): string {
  return JSON.stringify({
    name: value.name,
    nodes: value.nodes,
    edges: value.edges,
    groups: value.groups ?? [],
    materialFolders: value.materialFolders ?? [],
    materials: value.materials ?? [],
  });
}
