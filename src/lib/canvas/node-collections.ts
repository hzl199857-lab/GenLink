import type { CanvasNode } from "@/types/canvas";

export function dedupeCanvasNodesById(nodes: CanvasNode[]): CanvasNode[] {
  const seen = new Set<string>();
  const uniqueNodes: CanvasNode[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    uniqueNodes.push(node);
  }

  return uniqueNodes.length === nodes.length ? nodes : uniqueNodes;
}

export function appendUniqueCanvasNodes(
  existingNodes: CanvasNode[],
  incomingNodes: CanvasNode[],
): CanvasNode[] {
  const normalizedExistingNodes = dedupeCanvasNodesById(existingNodes);
  const seen = new Set(normalizedExistingNodes.map((node) => node.id));
  const additions: CanvasNode[] = [];

  for (const node of incomingNodes) {
    if (seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    additions.push(node);
  }

  return additions.length === 0
    ? normalizedExistingNodes
    : [...normalizedExistingNodes, ...additions];
}
