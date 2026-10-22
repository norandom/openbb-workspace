import { type LinearTickDensity, linearTickDensity } from "./linearTicks";
import type {
  Extent,
  RangeContinuousCategoryInput,
  Window,
} from "./rangeApplicationTypes";

export const RANGE_TICK_BUDGET = 10000;
export function finiteRangePair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Object.hasOwn(value, 0) &&
    Object.hasOwn(value, 1) &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}
export function validRangeDensity(d: LinearTickDensity): boolean {
  if (d === null || typeof d !== "object") return false;
  const { minTickCount: min, tickCount: count, maxTickCount: max } = d;
  return (
    [min, count, max].every(
      (v) => Number.isInteger(v) && v >= 0 && v <= RANGE_TICK_BUDGET,
    ) &&
    min <= count &&
    count <= max
  );
}
function validateInterval(
  interval: RangeContinuousCategoryInput["policy"]["interval"],
) {
  if (!interval || typeof interval !== "object" || Array.isArray(interval))
    throw Error("Invalid Range axis interval.");
  if (
    Object.keys(interval).some(
      (key) => !["step", "values", "minSpacing", "maxSpacing"].includes(key),
    )
  )
    throw Error("Unsupported Range axis interval option.");
  for (const v of [interval.minSpacing, interval.maxSpacing]) {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0))
      throw Error("Invalid Range axis spacing.");
  }
  if (
    interval.minSpacing !== undefined &&
    interval.maxSpacing !== undefined &&
    interval.minSpacing >= interval.maxSpacing
  )
    throw Error("Invalid Range axis spacing bounds.");
  const { values } = interval;
  if (
    values !== undefined &&
    (!Array.isArray(values) ||
      values.length > RANGE_TICK_BUDGET ||
      Array.from(values).some((v) => typeof v !== "number" || !Number.isFinite(v)))
  )
    throw Error("Invalid Range axis explicit values.");
}
export function validateRangeAxis(
  input: Omit<RangeContinuousCategoryInput, "kind">,
  collapsed: boolean,
) {
  if (!input || typeof input !== "object") throw Error("Invalid Range axis input.");
  const { domain, policy, span, visibleRange: window, density } = input;
  if (
    !domain ||
    !["full", "window"].includes(domain.mode) ||
    !policy ||
    typeof policy !== "object"
  )
    throw Error("Invalid Range axis domain/policy.");
  const extent = domain.mode === "full" ? domain.dataExtent : domain.fullExtent;
  if (
    !Array.isArray(extent) ||
    (extent.length !== 0 && (!finiteRangePair(extent) || extent[0] > extent[1]))
  )
    throw Error("Invalid Range axis extent.");
  if (
    !Number.isFinite(span) ||
    span < 0 ||
    !finiteRangePair(window) ||
    window[0] < 0 ||
    window[1] > 1 ||
    (collapsed ? window[0] > window[1] : window[0] >= window[1]) ||
    typeof policy.nice !== "boolean" ||
    typeof policy.reverse !== "boolean" ||
    (density !== undefined && !validRangeDensity(density))
  )
    throw Error("Invalid Range axis input.");
  for (const bound of [policy.min, policy.max]) {
    if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound)))
      throw Error("Invalid Range axis bound.");
  }
  if (policy.min !== undefined && policy.max !== undefined && policy.min >= policy.max)
    throw Error("Invalid Range axis explicit bounds.");
  validateInterval(policy.interval);
}
export function checkedRangeExtent(extent: Extent): Extent {
  if (!extent.length) return [];
  if (
    !finiteRangePair(extent) ||
    extent[0] > extent[1] ||
    !Number.isFinite(extent[1] - extent[0])
  )
    throw Error("Nonfinite Range axis arithmetic.");
  return [extent[0], extent[1]];
}
export function rangeSemanticExtent(
  input: Omit<RangeContinuousCategoryInput, "kind">,
): Extent {
  if (input.domain.mode === "window")
    return checkedRangeExtent(input.domain.fullExtent);
  const { dataExtent: data } = input.domain;
  const { min, max } = input.policy;
  if (!data.length && (min === undefined || max === undefined)) return [];
  const low = min ?? data[0]!;
  const high = max ?? data[1]!;
  return low > high ? [] : checkedRangeExtent([low, high]);
}
export function rangeVisibleExtent(full: Extent, window: Window): Extent {
  if (!full.length) return [];
  const delta = full[1] - full[0];
  return checkedRangeExtent([full[0] + delta * window[0], full[0] + delta * window[1]]);
}
export function rangeAxisDensity(
  input: Omit<RangeContinuousCategoryInput, "kind">,
  fraction = 1,
): LinearTickDensity {
  if (input.density !== undefined) return input.density;
  const {
    span,
    policy: {
      interval: { minSpacing, maxSpacing },
    },
  } = input;
  if (span === 0) return linearTickDensity(0);
  if (minSpacing === undefined && maxSpacing === undefined)
    return checkedDensity(linearTickDensity(span, fraction));
  const defaultMin = Math.max(50, span / 6);
  let min = minSpacing ?? defaultMin;
  let max = maxSpacing ?? span;
  if (min > max) {
    if (min === defaultMin) min = max;
    else max = min;
  }
  min = Math.max(min, 1);
  const maxTickCount = Math.max(1, Math.floor(span / (fraction * min)));
  const minTickCount = Math.min(maxTickCount, Math.ceil(span / (fraction * max)));
  return checkedDensity({
    minTickCount,
    maxTickCount,
    tickCount: Math.max(minTickCount, Math.min(Math.floor(5 / fraction), maxTickCount)),
  });
}
function checkedDensity(density: LinearTickDensity): LinearTickDensity {
  if (!validRangeDensity(density)) throw Error("Unsupported Range axis density.");
  return density;
}
export function normalizedRangeTicks(
  ticks: readonly number[],
  visible: Extent,
): number[] {
  if (
    ticks.length > RANGE_TICK_BUDGET ||
    Array.from(ticks).some((v) => !Number.isFinite(v))
  )
    throw Error("Invalid Range axis tick arithmetic.");
  if (!visible.length) return [];
  return [...new Set(ticks.filter((v) => v >= visible[0] && v <= visible[1]))].sort(
    (a, b) => a - b,
  );
}
