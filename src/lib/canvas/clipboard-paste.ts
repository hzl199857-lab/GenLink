const CANVAS_NODE_CLIPBOARD_MIME = 'application/x-genlink-canvas-nodes';
export const CANVAS_NODE_CLIPBOARD_TEXT_MARKER = '{"type":"genlink-canvas-nodes","version":1}';

type ClipboardEdge = {
  source: string;
  target: string;
};

export function getInternalClipboardEdges<T extends ClipboardEdge>(
  edges: T[],
  selectedNodeIds: Set<string>,
): T[] {
  return edges.filter(
    (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
  );
}

export function markCanvasNodeClipboard(data: DataTransfer | null): boolean {
  if (!data) {
    return false;
  }

  data.setData(CANVAS_NODE_CLIPBOARD_MIME, CANVAS_NODE_CLIPBOARD_TEXT_MARKER);
  data.setData('text/plain', CANVAS_NODE_CLIPBOARD_TEXT_MARKER);
  return true;
}

export function isCanvasNodeClipboard(data: DataTransfer | null): boolean {
  if (!data) {
    return false;
  }

  return (
    data.getData(CANVAS_NODE_CLIPBOARD_MIME) === CANVAS_NODE_CLIPBOARD_TEXT_MARKER ||
    data.getData('text/plain') === CANVAS_NODE_CLIPBOARD_TEXT_MARKER
  );
}

export function getClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }

  const filesFromItems = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (filesFromItems.length > 0) {
    return filesFromItems;
  }

  return Array.from(data.files).filter((file) => file.type.startsWith('image/'));
}
