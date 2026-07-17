import type {
  CanvasEdge,
  CanvasNode,
  ImageGenerationNodeData,
  ImageNodeData,
  UploadedImageNodeData,
  VideoNodeData,
} from "@/types/canvas";

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const TEXT_NODE_CARD_WIDTH = 511;
const TEXT_NODE_CARD_HEIGHT = 289;
const IMAGE_GENERATION_MAX_CARD_EDGE = 540;
const IMAGE_GENERATION_MIN_CARD_EDGE = 220;
const IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE = 64;
const IMAGE_GENERATION_CARD_ACCESSORY_GAP = 12;
const IMAGE_NODE_ADAPTER_TOP_PADDING = 74;
const UPLOADED_IMAGE_MAX_CARD_WIDTH = 420;
const UPLOADED_IMAGE_MAX_CARD_HEIGHT = 540;
const UPLOADED_IMAGE_MIN_CARD_WIDTH = 300;
const AGENT_NODE_COLUMN_GAP = 140;
const AGENT_NODE_ROW_GAP = 92;
const AGENT_CANVAS_COLLISION_PADDING = 48;
const AGENT_LAYOUT_MAX_ROWS_BEFORE_COLUMN_SHIFT = 24;

function parseCanvasAspectRatio(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

function resolveFittedImageDimensions(params: {
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
}): { width: number; height: number } {
  if (
    params.displayWidth &&
    params.displayHeight &&
    params.displayWidth > 0 &&
    params.displayHeight > 0
  ) {
    return {
      width: params.displayWidth,
      height: params.displayHeight,
    };
  }

  const imageWidth = Math.max(params.width || 320, 1);
  const imageHeight = Math.max(params.height || 320, 1);
  const imageAspectRatio = imageWidth / imageHeight;
  const fittedWidthByHeight = UPLOADED_IMAGE_MAX_CARD_HEIGHT * imageAspectRatio;
  const width = Math.min(
    UPLOADED_IMAGE_MAX_CARD_WIDTH,
    Math.max(
      UPLOADED_IMAGE_MIN_CARD_WIDTH,
      Math.min(imageWidth, fittedWidthByHeight),
    ),
  );

  return {
    width,
    height: width * (imageHeight / imageWidth),
  };
}

function getFirstValidImageDimensions(
  images: Array<{ width?: number; height?: number }> | undefined,
): { width?: number; height?: number } | null {
  return (
    images?.find(
      (image) => image.width && image.height && image.width > 0 && image.height > 0,
    ) ?? null
  );
}

function estimateImageGenerationDimensions(data: ImageGenerationNodeData): {
  width: number;
  height: number;
} {
  const generatedAspectRatio =
    data.generatedImageWidth &&
    data.generatedImageHeight &&
    data.generatedImageWidth > 0 &&
    data.generatedImageHeight > 0
      ? data.generatedImageWidth / data.generatedImageHeight
      : null;
  const referenceImage = getFirstValidImageDimensions(data.referenceImages);
  const referenceAspectRatio =
    referenceImage?.width && referenceImage?.height
      ? referenceImage.width / referenceImage.height
      : null;
  const explicitAspectRatio = parseCanvasAspectRatio(data.aspectRatio);
  const autoAspectRatio =
    data.aspectRatio === "auto"
      ? referenceAspectRatio ?? generatedAspectRatio
      : generatedAspectRatio;
  const resolvedAspectRatio = explicitAspectRatio ?? autoAspectRatio ?? 16 / 9;

  if (resolvedAspectRatio >= 1) {
    const width = IMAGE_GENERATION_MAX_CARD_EDGE;
    return {
      width,
      height: Math.max(
        IMAGE_GENERATION_MIN_CARD_EDGE,
        Math.round(width / resolvedAspectRatio),
      ),
    };
  }

  const height = IMAGE_GENERATION_MAX_CARD_EDGE;
  return {
    width: Math.max(
      IMAGE_GENERATION_MIN_CARD_EDGE,
      Math.round(height * resolvedAspectRatio),
    ),
    height,
  };
}

export function estimateCanvasNodeBounds(node: CanvasNode): CanvasRect {
  if (node.type === "text") {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: TEXT_NODE_CARD_WIDTH,
      height: TEXT_NODE_CARD_HEIGHT + 36,
    };
  }

  if (node.type === "image_generation") {
    const dimensions = estimateImageGenerationDimensions(node.data as ImageGenerationNodeData);
    return {
      x: node.position.x,
      y: node.position.y,
      width: Math.max(IMAGE_GENERATION_MAX_CARD_EDGE, dimensions.width),
      height:
        IMAGE_GENERATION_MAX_CARD_EDGE +
        IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE +
        IMAGE_GENERATION_CARD_ACCESSORY_GAP,
    };
  }

  if (node.type === "uploaded_image") {
    const dimensions = resolveFittedImageDimensions(node.data as UploadedImageNodeData);
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === "image") {
    const dimensions = resolveFittedImageDimensions(node.data as ImageNodeData);
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === "video") {
    const dimensions = resolveFittedImageDimensions(node.data as VideoNodeData);
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === "video_generation") {
    return {
      x: node.position.x,
      y: node.position.y,
      width: IMAGE_GENERATION_MAX_CARD_EDGE,
      height: 380,
    };
  }

  if (node.type === "video_upscale") {
    return {
      x: node.position.x,
      y: node.position.y,
      width: IMAGE_GENERATION_MAX_CARD_EDGE,
      height: 560,
    };
  }

  if (node.type === "panorama-360") {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: 720,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + 405 + 36,
    };
  }

  return {
    x: node.position.x,
    y: node.position.y,
    width: 420,
    height: 300,
  };
}

export function rectsOverlap(a: CanvasRect, b: CanvasRect, padding = 0): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function getBoundsForRects(rects: CanvasRect[]): CanvasRect | null {
  if (rects.length === 0) {
    return null;
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function moveNodesBy(nodes: CanvasNode[], dx: number, dy: number): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    position: {
      x: Math.round(node.position.x + dx),
      y: Math.round(node.position.y + dy),
    },
  }) as CanvasNode);
}

function findPromptNodeForImage(params: {
  imageNode: CanvasNode;
  textNodes: CanvasNode[];
  incomingEdges: CanvasEdge[];
}): CanvasNode | null {
  const textNodeIds = new Set(params.textNodes.map((node) => node.id));
  const promptEdge = params.incomingEdges.find(
    (edge) => edge.target === params.imageNode.id && textNodeIds.has(edge.source),
  );

  if (!promptEdge) {
    return null;
  }

  return params.textNodes.find((node) => node.id === promptEdge.source) ?? null;
}

function buildStackedAgentNodes(params: {
  incomingNodes: CanvasNode[];
  incomingEdges: CanvasEdge[];
  origin: { x: number; y: number };
}): CanvasNode[] {
  const imageNodes = params.incomingNodes.filter((node) => node.type === "image_generation");
  const textNodes = params.incomingNodes.filter((node) => node.type === "text");
  const pairedTextNodeIds = new Set<string>();
  const placedNodeIds = new Set<string>();
  const placedNodes: CanvasNode[] = [];
  let rowY = params.origin.y;

  if (imageNodes.length === 0) {
    const originalBounds = getBoundsForRects(params.incomingNodes.map(estimateCanvasNodeBounds));
    const baseNodes = originalBounds
      ? moveNodesBy(
          params.incomingNodes,
          params.origin.x - originalBounds.x,
          params.origin.y - originalBounds.y,
        )
      : params.incomingNodes;

    return baseNodes;
  }

  for (const imageNode of imageNodes) {
    const promptNode = findPromptNodeForImage({
      imageNode,
      textNodes,
      incomingEdges: params.incomingEdges,
    });
    const promptBounds = promptNode ? estimateCanvasNodeBounds(promptNode) : null;
    const imageBounds = estimateCanvasNodeBounds(imageNode);
    const rowHeight = Math.max(promptBounds?.height ?? 0, imageBounds.height);
    const imageX = params.origin.x;
    const promptX = imageX + imageBounds.width + AGENT_NODE_COLUMN_GAP;

    if (promptNode) {
      pairedTextNodeIds.add(promptNode.id);
      placedNodeIds.add(promptNode.id);
      placedNodes.push({
        ...promptNode,
        position: {
          x: promptX,
          y: Math.round(rowY - estimateCanvasNodeBounds(promptNode).y + promptNode.position.y),
        },
      } as CanvasNode);
    }

    placedNodeIds.add(imageNode.id);
    placedNodes.push({
      ...imageNode,
      position: {
        x: imageX,
        y: Math.round(rowY),
      },
    } as CanvasNode);

    rowY += rowHeight + AGENT_NODE_ROW_GAP;
  }

  const unpairedTextNodes = textNodes.filter((node) => !pairedTextNodeIds.has(node.id));
  for (const textNode of unpairedTextNodes) {
    placedNodeIds.add(textNode.id);
    placedNodes.push({
      ...textNode,
      position: {
        x: params.origin.x,
        y: Math.round(rowY + 8),
      },
    } as CanvasNode);
    rowY += estimateCanvasNodeBounds(textNode).height + AGENT_NODE_ROW_GAP;
  }

  const remainingNodes = params.incomingNodes.filter((node) => !placedNodeIds.has(node.id));
  for (const node of remainingNodes) {
    placedNodes.push({
      ...node,
      position: {
        x: params.origin.x,
        y: Math.round(rowY),
      },
    } as CanvasNode);
    rowY += estimateCanvasNodeBounds(node).height + AGENT_NODE_ROW_GAP;
  }

  return placedNodes;
}

function hasCollisionWithExisting(nodes: CanvasNode[], existingRects: CanvasRect[]): boolean {
  const candidateRects = nodes.map(estimateCanvasNodeBounds);

  return candidateRects.some((candidateRect) =>
    existingRects.some((existingRect) =>
      rectsOverlap(candidateRect, existingRect, AGENT_CANVAS_COLLISION_PADDING),
    ),
  );
}

export function layoutAgentWorkflowNodes(params: {
  incomingNodes: CanvasNode[];
  incomingEdges: CanvasEdge[];
  existingNodes: CanvasNode[];
  sourceNodes: CanvasNode[];
  fallbackStartPosition: { x: number; y: number };
}): CanvasNode[] {
  if (params.incomingNodes.length === 0) {
    return [];
  }

  const sourceBounds = getBoundsForRects(params.sourceNodes.map(estimateCanvasNodeBounds));
  const existingRects = params.existingNodes.map(estimateCanvasNodeBounds);
  const anchor = sourceBounds
    ? {
        x: sourceBounds.x + sourceBounds.width + AGENT_NODE_COLUMN_GAP,
        y: sourceBounds.y,
      }
    : params.fallbackStartPosition;
  const firstCandidate = buildStackedAgentNodes({
    incomingNodes: params.incomingNodes,
    incomingEdges: params.incomingEdges,
    origin: anchor,
  });
  const firstBounds = getBoundsForRects(firstCandidate.map(estimateCanvasNodeBounds));
  const verticalStep = Math.max(
    firstBounds?.height ?? IMAGE_GENERATION_MAX_CARD_EDGE,
    IMAGE_GENERATION_MAX_CARD_EDGE,
  ) + AGENT_CANVAS_COLLISION_PADDING;
  const horizontalStep = Math.max(
    firstBounds?.width ?? IMAGE_GENERATION_MAX_CARD_EDGE,
    IMAGE_GENERATION_MAX_CARD_EDGE,
  ) + AGENT_NODE_COLUMN_GAP;

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const row = attempt % AGENT_LAYOUT_MAX_ROWS_BEFORE_COLUMN_SHIFT;
    const column = Math.floor(attempt / AGENT_LAYOUT_MAX_ROWS_BEFORE_COLUMN_SHIFT);
    const origin = {
      x: anchor.x + column * horizontalStep,
      y: anchor.y + row * verticalStep,
    };
    const candidate = buildStackedAgentNodes({
      incomingNodes: params.incomingNodes,
      incomingEdges: params.incomingEdges,
      origin,
    });

    if (!hasCollisionWithExisting(candidate, existingRects)) {
      return candidate;
    }
  }

  return buildStackedAgentNodes({
    incomingNodes: params.incomingNodes,
    incomingEdges: params.incomingEdges,
    origin: {
      x: anchor.x + horizontalStep,
      y: anchor.y,
    },
  });
}
