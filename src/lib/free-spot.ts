// SOURCING: hand-rolled. @xyflow/react answers whether two rects overlap (getIntersectingNodes) but has no search for an open place, and the search is these few lines.

/** The nearest place below `from` a new card covers none of what is on a canvas. */
export function freeSpot(
  from: { x: number; y: number },
  taken: Array<{ x: number; y: number; width: number; height: number }>,
  size: { width: number; height: number },
  gap = 24,
) {
  const spot = { ...from }
  for (;;) {
    const blocker = taken.find(
      (rect) =>
        spot.x < rect.x + rect.width + gap &&
        spot.x + size.width + gap > rect.x &&
        spot.y < rect.y + rect.height + gap &&
        spot.y + size.height + gap > rect.y,
    )
    if (!blocker) return spot
    spot.y = blocker.y + blocker.height + gap
  }
}
