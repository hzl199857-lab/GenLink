import type {
  CanvasEdge,
  CanvasNode,
  NodeGroup,
  ProjectSnapshot,
} from "@/types/canvas";

interface BuildProjectSnapshotParams {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: NodeGroup[];
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
    createdAt: nextCreatedAt,
    updatedAt: nextUpdatedAt,
  };
}

export function getProjectSnapshotSignature(
  value: Pick<ProjectSnapshot, "name" | "nodes" | "edges" | "groups">,
): string {
  return JSON.stringify({
    name: value.name,
    nodes: value.nodes,
    edges: value.edges,
    groups: value.groups ?? [],
  });
}
