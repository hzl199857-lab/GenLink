import type {
  CanvasDocument,
  CanvasEdge,
  CanvasNode,
  NodeGroup,
  ProjectManifest,
  ProjectSnapshot,
} from "../../types/canvas";

export const DEFAULT_CANVAS_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function rewriteGraphReferences(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") {
    return idMap.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteGraphReferences(item, idMap));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteGraphReferences(item, idMap)]),
    );
  }

  return value;
}

export function getNextCanvasName(existingNames: string[]): string {
  const usedNumbers = new Set(
    existingNames.flatMap((name) => {
      const match = /^画布\s*(\d+)$/.exec(name.trim());
      return match ? [Number.parseInt(match[1], 10)] : [];
    }),
  );

  let index = 1;
  while (usedNumbers.has(index)) {
    index += 1;
  }

  return `画布${index}`;
}

export function getDuplicateCanvasName(sourceName: string, existingNames: string[]): string {
  const baseName = `${sourceName.trim() || "画布"} 副本`;
  const usedNames = new Set(existingNames.map((name) => name.trim()));

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let index = 2;
  while (usedNames.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export function createEmptyCanvasDocument(params: {
  id: string;
  name: string;
  now?: string;
}): CanvasDocument {
  const now = params.now ?? new Date().toISOString();

  return {
    version: 1,
    id: params.id,
    name: params.name.trim() || "画布",
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_CANVAS_VIEWPORT },
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateCanvasDocument(
  source: CanvasDocument,
  params: {
    id: string;
    name: string;
    now?: string;
    createId?: () => string;
  },
): CanvasDocument {
  const now = params.now ?? new Date().toISOString();
  const createId = params.createId ?? (() => crypto.randomUUID());
  const idMap = new Map<string, string>();

  for (const node of source.nodes) {
    idMap.set(node.id, createId());
  }
  for (const edge of source.edges) {
    idMap.set(edge.id, createId());
  }
  for (const group of source.groups ?? []) {
    idMap.set(group.id, createId());
  }

  const nodes = source.nodes.map((node): CanvasNode => ({
    ...cloneValue(node),
    id: idMap.get(node.id)!,
    data: rewriteGraphReferences(node.data, idMap) as CanvasNode["data"],
  } as CanvasNode));
  const edges = source.edges.map((edge): CanvasEdge => ({
    ...cloneValue(edge),
    id: idMap.get(edge.id)!,
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }));
  const groups = source.groups?.map((group): NodeGroup => ({
    ...cloneValue(group),
    id: idMap.get(group.id)!,
    nodeIds: group.nodeIds.map((nodeId) => idMap.get(nodeId) ?? nodeId),
  }));

  return {
    version: 1,
    id: params.id,
    name: params.name.trim() || getDuplicateCanvasName(source.name, [source.name]),
    nodes,
    edges,
    groups: groups && groups.length > 0 ? groups : undefined,
    viewport: cloneValue(source.viewport),
    createdAt: now,
    updatedAt: now,
  };
}

export function migrateLegacyProjectSnapshot(
  legacy: ProjectSnapshot,
  params: { canvasId: string; now?: string },
): { manifest: ProjectManifest; canvas: CanvasDocument } {
  const now = params.now ?? new Date().toISOString();
  const canvasName = "画布 1";
  const canvas: CanvasDocument = {
    version: 1,
    id: params.canvasId,
    name: canvasName,
    nodes: cloneValue(legacy.nodes),
    edges: cloneValue(legacy.edges),
    groups: legacy.groups?.length ? cloneValue(legacy.groups) : undefined,
    viewport: { ...DEFAULT_CANVAS_VIEWPORT },
    createdAt: legacy.createdAt || now,
    updatedAt: legacy.updatedAt || now,
  };
  const manifest: ProjectManifest = {
    version: 2,
    id: legacy.id,
    name: legacy.name,
    canvases: [{
      id: canvas.id,
      name: canvas.name,
      fileName: `${canvas.id}.json`,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    }],
    materialFolders: legacy.materialFolders?.length ? cloneValue(legacy.materialFolders) : undefined,
    materials: legacy.materials?.length ? cloneValue(legacy.materials) : undefined,
    thumbnailFileName: legacy.thumbnailFileName,
    createdAt: legacy.createdAt || now,
    updatedAt: legacy.updatedAt || now,
  };

  return { manifest, canvas };
}
