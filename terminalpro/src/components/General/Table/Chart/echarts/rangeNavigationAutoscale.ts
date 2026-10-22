import type { Extent, RangeApplicationInput, Window } from "./rangeApplicationTypes";
import { rangeBarBand } from "./rangeBarBands";
import type { RangeBarMappingInput } from "./rangeBarTypes";
import type { RangeComposed } from "./rangeLiveTypes";
import type { rangeNavigationPolicy } from "./rangeNavigationPolicy";
import { resolveRangeAppearance } from "../application/rangeAppearance";
import { _ModuleSupport, VERSION } from "ag-charts-community";

function visibleValues(full: RangeComposed, window: Window): number[] {
  const category = full.category;
  if (!category.fullExtent.length) return [];
  const [a, b] = category.fullExtent;
  const span = b - a;
  const bar = "direction" in full.mapping.style;
  const band = bar
    ? rangeBarBand(1, category, full.mapping as RangeBarMappingInput, 1, 0).width
    : 0;
  return full.projection.fields
    .filter((f) => f.enabled)
    .flatMap((f) =>
      f.data.flatMap((d) => {
        const coordinate = category.coordinates[d.groupSlot];
        if (coordinate === null || coordinate === undefined || !d.summary) return [];
        const fraction = span === 0 ? 0.5 : (coordinate - a) / span;
        // Native percentages crop the ascending domain; axis reversal changes pixels afterward.
        const center = fraction;
        return center + band / 2 < window[0] || center - band / 2 > window[1]
          ? []
          : [d.summary.min, d.summary.max];
      }),
    );
}
/** Community ZoomManager bounds: clamp to full domain, preserve explicit bounds and pad free ends. */
export function rangeNavigationAutoscale(
  input: RangeApplicationInput,
  full: RangeComposed,
  window: Window,
  policy: ReturnType<typeof rangeNavigationPolicy>,
): Extent | undefined {
  if (!policy.autoScale.enabled || (window[0] === 0 && window[1] === 1)) return;
  if (
    "direction" in full.mapping.style &&
    full.mapping.style.direction === "horizontal"
  )
    return;
  const extent = full.valueAxis.fullExtent;
  if (!extent.length || extent[0] === extent[1]) return;
  const values = visibleValues(full, window);
  if (!values.length) return;
  const ids = full.projection.fields.map((f) => f.descriptor.id);
  const bounds = resolveRangeAppearance(
    input,
    ids,
    full.category.kind,
    false,
  ).valuePolicy;
  const span = extent[1] - extent[0];
  let low =
    bounds.min === undefined
      ? Math.min(1, ...values.map((v) => (v - extent[0]) / span))
      : 0;
  let high =
    bounds.max === undefined
      ? Math.max(0, ...values.map((v) => (v - extent[0]) / span))
      : 1;
  if (low >= high) return;
  const padLow = bounds.min === undefined;
  const padHigh = bounds.max === undefined;
  const length = Math.min(
    1,
    (high - low) * (1 + (Number(padLow) + Number(padHigh)) * policy.autoScale.padding),
  );
  if (padLow && padHigh) {
    const mid = (low + high) / 2;
    low = mid - length / 2;
    high = mid + length / 2;
  } else if (padHigh) high = low + length;
  else if (padLow) low = high - length;
  if (low < 0) {
    high -= low;
    low = 0;
  } else if (high > 1) {
    low -= high - 1;
    high = 1;
  }
  return [extent[0] + low * span, extent[0] + high * span];
}

/** Retained horizontal quirk: endpoint values are converted through the physical-y category scale. */
export function rangeHorizontalAutoscale(
  input: RangeApplicationInput,
  full: RangeComposed,
  window: Window,
  policy: ReturnType<typeof rangeNavigationPolicy>,
): Window | undefined {
  if (!policy.autoScale.enabled || (window[0] === 0 && window[1] === 1)) return;
  const extent = full.category.fullExtent;
  if (!extent.length || extent[0] === extent[1]) return;
  const values = visibleValues(full, window);
  const span = extent[1] - extent[0];
  const ordinal =
    full.category.kind === "category" ? rangeOrdinalScale(full) : undefined;
  const fractions = values.flatMap((value) => {
    const fraction = ordinal ? ordinal.convert(value) : (value - extent[0]) / span;
    return Number.isFinite(fraction) ? [fraction] : [];
  });
  const bounds = resolveRangeAppearance(
    input,
    full.projection.fields.map((f) => f.descriptor.id),
    full.category.kind,
    true,
  ).categoryPolicy;
  return autoScaleWindow(fractions, bounds, policy.autoScale.padding);
}

export function rangeOrdinalScale(full: RangeComposed) {
  if (VERSION !== "12.1.1")
    throw Error("Range category conversion requires AG Community 12.1.1.");
  const scale = new _ModuleSupport.CategoryScale<string | number>();
  scale.domain = full.projection.groups.map((group) => group.category);
  scale.range = [0, 1];
  scale.paddingInner = full.mapping.style.band.paddingInner;
  scale.paddingOuter = full.mapping.style.band.paddingOuter;
  scale.round = false;
  return scale;
}

function autoScaleWindow(
  fractions: readonly number[],
  bounds: { readonly min?: number; readonly max?: number },
  padding: number,
): Window | undefined {
  let low = bounds.min === undefined ? Math.min(1, ...fractions) : 0;
  let high = bounds.max === undefined ? Math.max(0, ...fractions) : 1;
  if (low >= high) return;
  const padLow = bounds.min === undefined;
  const padHigh = bounds.max === undefined;
  const length = Math.min(
    1,
    (high - low) * (1 + (Number(padLow) + Number(padHigh)) * padding),
  );
  if (padLow && padHigh) {
    const mid = (low + high) / 2;
    low = mid - length / 2;
    high = mid + length / 2;
  } else if (padHigh) high = low + length;
  else if (padLow) low = high - length;
  if (low < 0) {
    high -= low;
    low = 0;
  } else if (high > 1) {
    low -= high - 1;
    high = 1;
  }
  return [low, high];
}
