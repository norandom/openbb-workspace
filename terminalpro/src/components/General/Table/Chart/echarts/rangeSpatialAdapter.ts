import { _ModuleSupport, VERSION } from "ag-charts-community";
import type { ChartPointerPoint } from "./chartPointerTypes";
import type { RangePickCandidate } from "./rangePointerTypes";

/** MIT Community 12.1.1 pure quadtree; no AG scene nodes or chart instances. */
export function createRangeSpatialIndex(
  candidates: readonly RangePickCandidate[],
  viewport: { readonly width: number; readonly height: number },
) {
  if (VERSION !== "12.1.1")
    throw Error("Range spatial contract requires AG Community 12.1.1.");
  const tree = new _ModuleSupport.QuadtreeNearest<RangePickCandidate>(
    100,
    10,
    new _ModuleSupport.BBox(0, 0, viewport.width, viewport.height),
  );
  for (const candidate of candidates) {
    const rect = candidate.rect;
    if (!rect) continue;
    tree.addValue(
      {
        midPoint: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        distanceSquared: (x, y) => {
          const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width);
          const dy = Math.max(rect.y - y, 0, y - rect.y - rect.height);
          return dx * dx + dy * dy;
        },
      },
      candidate,
    );
  }
  return (point: ChartPointerPoint) => {
    const found = tree.find(point.x, point.y);
    return found.distanceSquared === 0 ? found.nearest?.value : undefined;
  };
}
