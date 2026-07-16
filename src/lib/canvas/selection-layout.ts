export type CanvasLayoutMode = "grid" | "horizontal" | "vertical";

export type LayoutItem = {
  id: string;
  position: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
};

export function calculateNodeLayout(
  items: LayoutItem[],
  mode: CanvasLayoutMode,
  anchor: { x: number; y: number },
  gap: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  if (items.length === 0) {
    return new Map();
  }

  const orderedItems = [...items].sort((a, b) => (
    a.bounds.y - b.bounds.y ||
    a.bounds.x - b.bounds.x ||
    a.id.localeCompare(b.id)
  ));
  const maxWidth = Math.max(...orderedItems.map((item) => item.bounds.width));
  const maxHeight = Math.max(...orderedItems.map((item) => item.bounds.height));
  const columns = mode === "grid"
    ? Math.max(1, Math.ceil(Math.sqrt(orderedItems.length)))
    : mode === "horizontal"
      ? orderedItems.length
      : 1;
  const positions = new Map<string, { x: number; y: number }>();

  orderedItems.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const targetBoundsX = anchor.x + column * (maxWidth + gap.x);
    const targetBoundsY = anchor.y + row * (maxHeight + gap.y);

    positions.set(item.id, {
      x: item.position.x + targetBoundsX - item.bounds.x,
      y: item.position.y + targetBoundsY - item.bounds.y,
    });
  });

  return positions;
}
