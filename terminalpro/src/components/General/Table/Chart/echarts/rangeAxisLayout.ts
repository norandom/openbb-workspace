import type { RangeAppearance } from "../application/rangeAppearance";
import type { RangeResolvedAxis } from "../application/rangeAxisAppearance";
import type { LinearTickDensity } from "./linearTicks";
import type { RangeApplicationInput } from "./rangeApplicationTypes";
import { rangeDisplayText } from "./rangeBarAdmission";
import type { RangeBarProjection } from "./rangeBarTypes";
import { planRangeContinuousCategory } from "./rangeCategoryAxis";
import { rangeCategoryData, resolveRangeCategory } from "./rangeCategoryCoordinates";
import type {
  RangeCategoryKind,
  RangeCategoryPlan,
  RangeCategoryTick,
} from "./rangeCategoryTypes";
import { rangeAxisFootprint, rangeLabelsFit, rangeWrapLabel } from "./rangeLabelLayout";
import { planRangeValueAxis } from "./rangeValueAxis";

export interface RangeLayoutContext {
  readonly input: RangeApplicationInput;
  readonly appearance: RangeAppearance;
  readonly projection: RangeBarProjection;
  readonly kind: RangeCategoryKind;
  readonly horizontal: boolean;
}
type Grid = { left: number; right: number; top: number; bottom: number };
function plot(viewport: RangeApplicationInput["viewport"], grid: Grid) {
  return {
    left: Math.min(viewport.width, grid.left),
    top: Math.min(viewport.height, grid.top),
    width: Math.max(0, viewport.width - grid.left - grid.right),
    height: Math.max(0, viewport.height - grid.top - grid.bottom),
  };
}
function rotation(
  axis: RangeResolvedAxis,
  ticks: readonly RangeCategoryTick[],
  extent: RangeCategoryPlan["visibleExtent"],
  span: number,
  horizontal: boolean,
) {
  const current = axis.labels.rotation ?? 0;
  return axis.labels.rotation === undefined &&
    axis.labels.autoRotate &&
    !rangeLabelsFit(ticks, extent, span, axis, horizontal, current)
    ? -25
    : current;
}
function ordinal(c: RangeLayoutContext, span: number) {
  const axis = c.appearance.application.axes.category;
  const style = { categoryAxis: axis, band: c.appearance.band };
  const family = c.input.family === "rangeBar" ? "bar" : "area";
  const labels = c.projection.groups.map((g) =>
    rangeDisplayText(c.input.display.category(g.category)),
  );
  const full =
    c.input.categoryFullExtent ??
    resolveRangeCategory(style, c.projection, labels, family).fullExtent;
  const window = c.input.visibleRange ?? [0, 1];
  const low = full.length ? full[0] + (full[1] - full[0]) * window[0] : 0;
  const high = full.length ? full[0] + (full[1] - full[0]) * window[1] : 0;
  const band = span / Math.max(1, high - low);
  const limit = (c.horizontal ? c.input.viewport.width : c.input.viewport.height) * 0.3;
  let ticks = c.projection.groups
    .filter((g) => g.slot >= low && g.slot <= high)
    .map((g) => ({
      coordinate: g.slot,
      label: rangeWrapLabel(
        labels[g.slot],
        c.horizontal ? limit : band,
        c.horizontal ? band : limit,
        axis.labels,
      ),
    }));
  const extent = full.length ? ([low, high] as const) : ([] as const);
  const degrees = rotation(axis, ticks, extent, span, !c.horizontal);
  if (axis.labels.avoidCollisions) {
    const all = ticks;
    for (let stride = 1; stride < Math.max(2, all.length * 2); stride *= 2) {
      ticks = all.filter((_, index) => index % stride === 0);
      if (rangeLabelsFit(ticks, extent, span, axis, !c.horizontal, degrees)) break;
    }
  }
  const coordinates = {
    kind: "category" as const,
    fullExtent: full,
    visibleRange: window,
    reverse: c.appearance.categoryPolicy.reverse,
    ticks,
  };
  return {
    plan: resolveRangeCategory(
      { ...style, categoryCoordinates: coordinates },
      c.projection,
      labels,
      family,
    ),
    coordinates,
    rotation: degrees,
  };
}
function continuous(c: RangeLayoutContext, span: number) {
  const axis = c.appearance.application.axes.category;
  const policy = c.appearance.categoryPolicy;
  const family = c.input.family === "rangeBar" ? "bar" : "area";
  const data = rangeCategoryData(c.projection, c.kind, family);
  const domain =
    c.input.categoryFullExtent === undefined
      ? { mode: "full" as const, dataExtent: data.paddedExtent }
      : { mode: "window" as const, fullExtent: c.input.categoryFullExtent };
  const window = c.input.visibleRange ?? [0, 1];
  let density: LinearTickDensity | undefined;
  let result: ReturnType<typeof planRangeContinuousCategory> | undefined;
  let plan: RangeCategoryPlan | undefined;
  let degrees = axis.labels.rotation ?? 0;
  const labels = c.projection.groups.map((g) => String(g.category));
  for (let pass = 0; pass < 12; pass++) {
    result = planRangeContinuousCategory({
      kind: c.kind as "number" | "time",
      domain,
      policy,
      span,
      visibleRange: window,
      density,
      labelFormat: axis.fields.timeFormat || undefined,
    });
    result = { ...result, category: { ...result.category, reverse: policy.reverse } };
    plan = resolveRangeCategory(
      {
        categoryAxis: axis,
        band: c.appearance.band,
        categoryCoordinates: result.category,
      },
      c.projection,
      labels,
      family,
    );
    degrees = rotation(axis, plan.ticks, plan.visibleExtent, span, !c.horizontal);
    if (
      policy.interval.step !== undefined ||
      policy.interval.values !== undefined ||
      rangeLabelsFit(
        plan.ticks,
        plan.visibleExtent,
        span,
        axis,
        !c.horizontal,
        degrees,
      ) ||
      result.density.tickCount <= result.density.minTickCount
    )
      break;
    density = lowerDensity(result.density);
  }
  return { plan: plan!, coordinates: result!.category, rotation: degrees };
}
function lowerDensity(d: LinearTickDensity): LinearTickDensity {
  return { ...d, tickCount: Math.max(d.minTickCount, d.tickCount - 1) };
}
function numeric(c: RangeLayoutContext, span: number) {
  const axis = c.appearance.application.axes.number;
  const policy = c.appearance.valuePolicy;
  let density: LinearTickDensity | undefined;
  let plan: ReturnType<typeof planRangeValueAxis> | undefined;
  let degrees = axis.labels.rotation ?? 0;
  for (let pass = 0; pass < 12; pass++) {
    plan = planRangeValueAxis({
      dataExtent: c.input.valueDataExtent ?? c.projection.dataExtent,
      fullExtent: c.input.valueFullExtent,
      visibleRange: c.input.valueVisibleRange,
      bounds: {},
      span,
      density,
      policy,
    });
    const ticks = plan.rawTicks.map((coordinate) => ({
      coordinate,
      label: rangeDisplayText(c.input.display.numericAxis(coordinate)),
    }));
    degrees = rotation(axis, ticks, plan.visibleExtent, span, c.horizontal);
    if (
      policy.interval.step !== undefined ||
      policy.interval.values !== undefined ||
      rangeLabelsFit(ticks, plan.visibleExtent, span, axis, c.horizontal, degrees) ||
      plan.density.tickCount <= plan.density.minTickCount
    )
      break;
    density = lowerDensity(plan.density);
  }
  return { plan: plan!, rotation: degrees };
}
function plans(c: RangeLayoutContext, p: ReturnType<typeof plot>) {
  const categorySpan = c.horizontal ? p.height : p.width;
  const valueSpan = c.horizontal ? p.width : p.height;
  return {
    category:
      c.kind === "category" ? ordinal(c, categorySpan) : continuous(c, categorySpan),
    numeric: numeric(c, valueSpan),
  };
}
export function rangeAxisLayout(c: RangeLayoutContext, chrome: Grid) {
  const a = c.appearance.application;
  const inset = c.input.plotBottomInset ?? 0;
  if (!Number.isFinite(inset) || inset < 0)
    throw Error("Invalid Range navigation reservation.");
  chrome = { ...chrome, bottom: chrome.bottom + inset };
  let grid = { ...chrome };
  let categoryFootprint = 0;
  let valueFootprint = 0;
  // Monotone reservations bound wrap/tick feedback; the final pass replans both axes.
  for (let pass = 0; pass < 6; pass++) {
    const current = plans(c, plot(c.input.viewport, grid));
    categoryFootprint = Math.max(
      categoryFootprint,
      rangeAxisFootprint(
        a.axes.category,
        current.category.plan.ticks.map((t) => t.label),
        !c.horizontal,
        current.category.rotation,
      ),
    );
    valueFootprint = Math.max(
      valueFootprint,
      rangeAxisFootprint(
        a.axes.number,
        current.numeric.plan.rawTicks.map((v) =>
          rangeDisplayText(c.input.display.numericAxis(v)),
        ),
        c.horizontal,
        current.numeric.rotation,
      ),
    );
    const next = { ...chrome };
    next[a.axes.category.fields.position as keyof Grid] += categoryFootprint;
    next[a.axes.number.fields.position as keyof Grid] += valueFootprint;
    if (
      Object.keys(grid).every(
        (key) => grid[key as keyof Grid] === next[key as keyof Grid],
      )
    )
      break;
    grid = next;
  }
  const finalPlot = plot(c.input.viewport, grid);
  return { plot: finalPlot, ...plans(c, finalPlot) };
}
