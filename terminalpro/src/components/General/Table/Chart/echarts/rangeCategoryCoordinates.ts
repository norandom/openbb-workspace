import type { RangeBarProjection } from "./rangeBarTypes";
import {
  admitCategoryGroups,
  admitCategoryLabels,
  admitCategoryStyle,
  admitCategoryTicks,
  categoryKind,
  finiteCategoryNumber,
  finiteCategoryResult,
} from "./rangeCategoryAdmission";
import type {
  RangeCategoryData,
  RangeCategoryExtent,
  RangeCategoryKind,
  RangeCategoryPlan,
  RangeCategoryStyle,
} from "./rangeCategoryTypes";

function observed(coordinates: readonly (number | null)[]): RangeCategoryExtent {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const c of coordinates)
    if (c !== null) {
      min = Math.min(min, c);
      max = Math.max(max, c);
    }
  if (min === Number.POSITIVE_INFINITY) return [];
  finiteCategoryResult(max - min);
  return [min, max];
}
function interval(coordinates: readonly (number | null)[]): number | null {
  let smallest: number | null = null;
  let previous: number | null = null;
  for (const c of coordinates) {
    if (c !== null && previous !== null) {
      const difference = finiteCategoryResult(Math.abs(c - previous));
      if (difference > 0 && (smallest === null || difference < smallest))
        smallest = difference;
    }
    previous = c;
  }
  return smallest;
}
export function rangeCategoryData(
  projection: RangeBarProjection,
  kind: RangeCategoryKind,
  family: "bar" | "area",
): RangeCategoryData {
  if (!categoryKind(kind) || (family !== "bar" && family !== "area"))
    throw Error("Unsupported Range category kind or family.");
  const coordinates = admitCategoryGroups(projection).map((g) =>
    kind === "category" ? g.slot : finiteCategoryNumber(g.category) ? g.category : null,
  );
  const observedExtent = observed(coordinates);
  const minInterval = kind === "category" ? null : interval(coordinates);
  const padding = family === "bar" && minInterval !== null ? minInterval / 2 : 0;
  const paddedExtent: RangeCategoryExtent =
    observedExtent.length === 0
      ? []
      : [
          finiteCategoryResult(observedExtent[0] - padding),
          finiteCategoryResult(observedExtent[1] + padding),
        ];
  if (paddedExtent.length !== 0)
    finiteCategoryResult(paddedExtent[1] - paddedExtent[0]);
  return { coordinates, observedExtent, paddedExtent, minInterval };
}
function ordinalExtent(style: RangeCategoryStyle, count: number): RangeCategoryExtent {
  const b = style.band;
  const inset = b.paddingOuter + (1 - b.paddingInner) / 2;
  return count > 1 ? [-inset, count - 1 + inset] : [-0.5, 0.5];
}
function visibleExtent(
  full: RangeCategoryExtent,
  window: readonly [number, number],
): RangeCategoryExtent {
  if (full.length === 0) return [];
  const span = finiteCategoryResult(full[1] - full[0]);
  const min =
    window[0] === 0 ? full[0] : finiteCategoryResult(full[0] + span * window[0]);
  const max =
    window[1] === 1 ? full[1] : finiteCategoryResult(full[0] + span * window[1]);
  finiteCategoryResult(max - min);
  if (span > 0 && min >= max) throw Error("Collapsed Range category window.");
  return [min, max];
}
export function resolveRangeCategory(
  style: RangeCategoryStyle,
  projection: RangeBarProjection,
  categoryLabels: readonly string[],
  family: "bar" | "area",
): RangeCategoryPlan {
  const s = admitCategoryStyle(style);
  const kind = s.categoryCoordinates?.kind ?? "category";
  const data = rangeCategoryData(projection, kind, family);
  admitCategoryLabels(categoryLabels, data.coordinates.length);
  const fullExtent =
    s.categoryCoordinates?.fullExtent ?? ordinalExtent(s, data.coordinates.length);
  const window = s.categoryCoordinates?.visibleRange ?? [0, 1];
  const visible = visibleExtent(fullExtent, window);
  const ticks =
    s.categoryCoordinates?.ticks ??
    data.coordinates.map((coordinate, slot) => ({
      coordinate: coordinate!,
      label: categoryLabels[slot],
    }));
  admitCategoryTicks(ticks, visible);
  return {
    ...data,
    kind,
    fullExtent,
    visibleExtent: visible,
    visibleFraction: finiteCategoryResult(window[1] - window[0]),
    ticks,
  };
}
export function rangeCategoryTransport(
  plan: RangeCategoryPlan,
): readonly [number, number] | null {
  const extent = plan.visibleExtent;
  if (extent.length === 0) return null;
  return extent[0] === extent[1] ? [0, 1] : [extent[0], extent[1]];
}
function inside(plan: RangeCategoryPlan, coordinate: number): boolean {
  const e = plan.visibleExtent;
  return (
    finiteCategoryNumber(coordinate) &&
    e.length === 2 &&
    coordinate >= e[0] &&
    coordinate <= e[1]
  );
}
export function rangeCategoryEngineCoordinate(
  plan: RangeCategoryPlan,
  coordinate: number,
): number {
  if (!finiteCategoryNumber(coordinate) || plan.visibleExtent.length === 0)
    throw Error("Expected admitted Range category coordinate.");
  if (plan.visibleExtent[0] !== plan.visibleExtent[1]) return coordinate;
  if (coordinate !== plan.visibleExtent[0])
    throw Error("Range category coordinate outside singleton domain.");
  return 0.5;
}
export function rangeCategoryExactSlot(
  plan: RangeCategoryPlan,
  engineCoordinate: number,
): number | null {
  if (!finiteCategoryNumber(engineCoordinate) || plan.visibleExtent.length === 0)
    return null;
  const e = plan.visibleExtent;
  const coordinate =
    e[0] === e[1] ? (engineCoordinate === 0.5 ? e[0] : null) : engineCoordinate;
  if (coordinate === null || !inside(plan, coordinate)) return null;
  const slot = plan.coordinates.indexOf(coordinate);
  return slot < 0 ? null : slot;
}
export function rangeCategoryCell(
  plan: RangeCategoryPlan,
  groupSlot: number,
): readonly [number, number] | null {
  if (!Number.isInteger(groupSlot) || groupSlot < 0) return null;
  const coordinate = plan.coordinates[groupSlot];
  if (coordinate === null || coordinate === undefined || !inside(plan, coordinate))
    return null;
  const sorted = [
    ...new Set(plan.coordinates.filter((c): c is number => c !== null)),
  ].sort((a, b) => a - b);
  const index = sorted.indexOf(coordinate);
  const extent = plan.visibleExtent as readonly [number, number];
  const previous = sorted[index - 1];
  const next = sorted[index + 1];
  const min =
    previous === undefined
      ? extent[0]
      : Math.max(extent[0], previous + (coordinate - previous) / 2);
  const max =
    next === undefined
      ? extent[1]
      : Math.min(extent[1], coordinate + (next - coordinate) / 2);
  finiteCategoryResult(min);
  finiteCategoryResult(max);
  if (min > max) throw Error("Reversed Range category cell.");
  return [min, max];
}
export function rangeContinuousBandwidth(
  plan: RangeCategoryPlan,
  plotSpan: number,
  minWidth = 1,
): number {
  if (
    !finiteCategoryNumber(plotSpan) ||
    plotSpan < 0 ||
    !finiteCategoryNumber(minWidth) ||
    minWidth < 0 ||
    !finiteCategoryNumber(plan.visibleFraction) ||
    plan.visibleFraction <= 0 ||
    plan.visibleFraction > 1
  )
    throw Error("Expected finite Range category bandwidth inputs.");
  const expanded = finiteCategoryResult(plotSpan / plan.visibleFraction);
  if (plan.fullExtent.length === 0) return expanded;
  const span = finiteCategoryResult(plan.fullExtent[1] - plan.fullExtent[0]);
  if (
    span < 0 ||
    (plan.minInterval !== null &&
      (!finiteCategoryNumber(plan.minInterval) || plan.minInterval <= 0))
  )
    throw Error("Expected admitted Range category interval and domain.");
  let count = finiteCategoryResult(
    plan.minInterval === null ? 1 : span / plan.minInterval + 1,
  );
  if (minWidth !== 0) count = Math.min(count, Math.floor(expanded));
  return finiteCategoryResult(expanded / Math.max(1, count));
}
