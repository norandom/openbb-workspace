import type { CustomSeriesRenderItemAPI } from "echarts";
import { rangeCoordinate } from "./rangeAreaAxes";
import { finitePoints, type Point } from "./rangeAreaPaths";
import type { RangeAreaMappingInput, RangeAreaProjection } from "./rangeAreaTypes";
import {
  rangeCategoryCell,
  rangeCategoryEngineCoordinate,
} from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

export type AreaPlot = { x: number; y: number; width: number; height: number };
type Coord = CustomSeriesRenderItemAPI["coord"];
export function areaCategoryCoordinate(
  category: RangeCategoryPlan,
  slot: number,
): number | null {
  const value = category.coordinates[slot];
  const e = category.visibleExtent;
  if (
    value === null ||
    value === undefined ||
    e.length === 0 ||
    (e[0] === e[1] && value !== e[0])
  )
    return null;
  return rangeCategoryEngineCoordinate(category, value);
}
export function areaPoint(
  slot: number,
  value: number,
  input: RangeAreaMappingInput,
  category: RangeCategoryPlan,
  coord: Coord,
): Point {
  const x = areaCategoryCoordinate(category, slot);
  if (x === null) throw Error("Expected admitted Range Area coordinate.");
  const p = coord([x, rangeCoordinate(value, input)]);
  const result: Point = [p[0], p[1]];
  finitePoints([result]);
  return result;
}
function categoryPixels(
  category: RangeCategoryPlan,
  slot: number,
  plot: AreaPlot,
  coord: Coord,
): readonly [number, number] | null {
  const cell = rangeCategoryCell(category, slot);
  if (!cell) return null;
  if (category.visibleExtent[0] === category.visibleExtent[1])
    return [plot.x, plot.x + plot.width];
  return cell
    .map((v) => coord([rangeCategoryEngineCoordinate(category, v), 0])[0])
    .sort((a, b) => a - b) as [number, number];
}
export function rangeAreaHit(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  index: number,
  slot: number,
  category: RangeCategoryPlan,
  plot: AreaPlot,
  coord: Coord,
) {
  const datum = projection.fields[index].data[slot];
  const cell = categoryPixels(category, slot, plot, coord);
  if (!datum?.summary || !cell) return;
  const a = areaPoint(slot, datum.summary.min, input, category, coord);
  const b = areaPoint(slot, datum.summary.max, input, category, coord);
  const lo = Math.min(a[1], b[1]);
  const hi = Math.max(a[1], b[1]);
  if (hi < plot.y || lo > plot.y + plot.height) return;
  const x = Math.max(plot.x, cell[0]);
  const endX = Math.min(plot.x + plot.width, cell[1]);
  const y = Math.max(plot.y, lo === hi ? lo - 0.5 : lo);
  const endY = Math.min(plot.y + plot.height, lo === hi ? hi + 0.5 : hi);
  const width = endX - x;
  const height = endY - y;
  finitePoints([
    [x, y],
    [width, height],
  ]);
  if (width < 0 || height < 0) throw Error("Reversed Range Area hit rectangle.");
  return {
    type: "rect" as const,
    silent: false,
    shape: { x, y, width, height },
    style: { fill: "rgba(0,0,0,0)" },
  };
}
