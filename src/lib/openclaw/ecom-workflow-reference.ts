import type { GLWorkflow } from "@/lib/planf-ecom";

export function bindUploadedReferencesToEcomWorkflow(
  workflow: GLWorkflow,
  sourceNodeIds: string[],
): GLWorkflow {
  const referenceNodeIds = Array.from(new Set(
    sourceNodeIds.map((nodeId) => nodeId.trim()).filter(Boolean),
  ));

  if (referenceNodeIds.length === 0) {
    return workflow;
  }

  const imageNodes = workflow.nodes.filter((node) => node.type === "image_generation");
  const imageNodeIds = new Set(imageNodes.map((node) => node.id));
  const retainedNodes = workflow.nodes
    .filter((node) => node.type !== "text")
    .map((node) => {
      if (node.type !== "image_generation") {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          subType: "image-image",
          sourceNodeId: referenceNodeIds[0],
          referenceSourceNodeIds: referenceNodeIds,
          editAction: "redraw",
        },
      };
    });
  const retainedNodeIds = new Set(retainedNodes.map((node) => node.id));
  const retainedEdges = workflow.edges.filter((edge) => (
    !imageNodeIds.has(edge.target) &&
    retainedNodeIds.has(edge.source) &&
    retainedNodeIds.has(edge.target)
  ));
  const referenceEdges = referenceNodeIds.flatMap((sourceNodeId, sourceIndex) => (
    imageNodes.map((imageNode) => ({
      id: `edge-reference-${sourceIndex + 1}-${imageNode.id}`,
      source: sourceNodeId,
      target: imageNode.id,
      role: "reference",
    }))
  ));

  return {
    ...workflow,
    nodes: retainedNodes,
    edges: [...retainedEdges, ...referenceEdges],
  };
}
