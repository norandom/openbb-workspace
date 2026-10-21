import type { BoxValueScale } from "./boxPlotDomain";
import {
  type BoxTickDensity,
  boxRawTicks,
  boxTickDensity,
  niceBoxExtent,
} from "./boxPlotTicks";
import type { BoxPlotDomain } from "./boxPlotTypes";

export type { BoxTickDensity } from "./boxPlotTicks";
export interface BoxAxisWindow {
  readonly start: number;
  readonly end: number;
}
export interface BoxValueAxisPlan {
  readonly semanticExtent: readonly [] | readonly [number, number];
  readonly fullExtent: readonly [] | readonly [number, number];
  readonly visibleExtent: readonly [] | readonly [number, number];
  readonly rawTicks: readonly number[];
  readonly fullTransport: BoxValueScale;
  readonly transport: BoxValueScale;
  readonly density: BoxTickDensity;
  readonly span: number;
}
export function boxAxisTransport(
  extent: readonly [] | readonly [number, number],
  ticks: readonly number[],
): BoxValueScale {
  if (!extent.length) return { min: 0, max: 1, ticks: [] };
  if (extent[0] === extent[1])
    return { min: 0, max: 1, constant: extent[0], ticks: ticks.length ? [0.5] : [] };
  return { min: extent[0], max: extent[1], ticks };
}
export function planBoxValueAxis(
  domain: BoxPlotDomain,
  span: number,
  density: BoxTickDensity,
  visibleRange: readonly [number, number] = [0, 1],
): BoxValueAxisPlan {
  if (
    ![span, ...Object.values(density), ...domain.value, ...visibleRange].every(
      Number.isFinite,
    ) ||
    span < 0 ||
    visibleRange[0] < 0 ||
    visibleRange[1] > 1 ||
    visibleRange[0] > visibleRange[1]
  )
    throw Error("Invalid Box axis plan.");
  const fullExtent = domain.value.length
    ? niceBoxExtent(domain.value, density)
    : ([] as const);
  if (!fullExtent.every(Number.isFinite)) throw Error("Nonfinite Box nice extent.");
  const visibleExtent = fullExtent.length
    ? ([
        fullExtent[0] + (fullExtent[1] - fullExtent[0]) * visibleRange[0],
        fullExtent[0] + (fullExtent[1] - fullExtent[0]) * visibleRange[1],
      ] as const)
    : ([] as const);
  if (!visibleExtent.every(Number.isFinite))
    throw Error("Nonfinite Box visible extent.");
  const fraction = visibleRange[1] - visibleRange[0];
  const zoomDensity =
    fraction > 0 && fraction < 1 ? boxTickDensity(span, fraction) : density;
  const rawTicks = fullExtent.length
    ? boxRawTicks(fullExtent, zoomDensity, visibleExtent as [number, number])
    : [];
  return {
    semanticExtent: domain.value,
    fullExtent,
    visibleExtent,
    rawTicks,
    fullTransport: boxAxisTransport(fullExtent, rawTicks),
    transport: boxAxisTransport(visibleExtent, rawTicks),
    density,
    span,
  };
}
