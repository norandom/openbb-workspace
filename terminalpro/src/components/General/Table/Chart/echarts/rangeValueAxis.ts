import {
  type LinearTickDensity,
  linearRawTicks,
  linearTickDensity,
  niceLinearExtent,
} from "./linearTicks";
import type { ResolvedRangeBarScale } from "./rangeBarTypes";

type Extent = readonly [] | readonly [number, number];
export interface RangeValueAxisInput {
  readonly dataExtent: Extent;
  readonly bounds: { readonly min?: number; readonly max?: number };
  readonly span: number;
  readonly density?: LinearTickDensity;
  readonly visibleRange?: readonly [number, number];
}
export interface RangeValueAxisPlan {
  readonly semanticExtent: Extent;
  readonly fullExtent: Extent;
  readonly visibleExtent: Extent;
  readonly rawTicks: readonly number[];
  readonly density: LinearTickDensity;
  readonly span: number;
  readonly valueScale: ResolvedRangeBarScale | null;
}

function finitePair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Object.hasOwn(value, 0) &&
    Object.hasOwn(value, 1) &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}
function validDensity(density: LinearTickDensity): boolean {
  if (density === null || typeof density !== "object") return false;
  const { minTickCount: min, tickCount: count, maxTickCount: max } = density;
  return (
    [min, count, max].every((v) => Number.isInteger(v) && v >= 0) &&
    min <= count &&
    count <= max
  );
}
function validate(input: RangeValueAxisInput, window: readonly [number, number]) {
  const { dataExtent: data, span, bounds, density } = input;
  if (
    !Array.isArray(data) ||
    (data.length !== 0 && (!finitePair(data) || data[0] > data[1])) ||
    !Number.isFinite(span) ||
    span < 0 ||
    bounds === null ||
    typeof bounds !== "object" ||
    !finitePair(window) ||
    window[0] < 0 ||
    window[1] > 1 ||
    window[0] > window[1] ||
    (bounds.min !== undefined && !Number.isFinite(bounds.min)) ||
    (bounds.max !== undefined && !Number.isFinite(bounds.max)) ||
    (density !== undefined && !validDensity(density))
  )
    throw Error("Invalid Range value axis input.");
}
function semanticExtent({ dataExtent: data, bounds }: RangeValueAxisInput): Extent {
  if (data.length === 0 && (bounds.min === undefined || bounds.max === undefined))
    return [];
  const low = bounds.min ?? data[0]!;
  const high = bounds.max ?? data[1]!;
  if (low > high) return [];
  if (!Number.isFinite(high - low)) throw Error("Nonfinite Range axis domain span.");
  return [low, high];
}
function fullExtent(semantic: Extent, density: LinearTickDensity): Extent {
  if (!semantic.length) return [];
  // A raw constant stays constant; only the Range mapper owns midpoint transport.
  const extent =
    semantic[0] === semantic[1] ? [...semantic] : niceLinearExtent(semantic, density);
  if (!finitePair(extent) || !Number.isFinite(extent[1] - extent[0]))
    throw Error("Nonfinite Range axis nice extent.");
  return extent;
}
function visibleExtent(full: Extent, window: readonly [number, number]): Extent {
  if (!full.length) return [];
  const extent = window.map((v) => full[0] + (full[1] - full[0]) * v);
  if (!finitePair(extent) || !Number.isFinite(extent[1] - extent[0]))
    throw Error("Nonfinite Range axis visible extent.");
  return extent;
}
function ticks(
  full: Extent,
  visible: Extent,
  density: LinearTickDensity,
  span: number,
): number[] {
  if (!full.length || !visible.length || span === 0) return [];
  let raw: number[];
  try {
    raw = linearRawTicks(full, density, visible);
  } catch {
    throw Error("Unsupported Range axis tick arithmetic.");
  }
  if (!raw.every((v, i) => Number.isFinite(v) && (i === 0 || v > raw[i - 1])))
    throw Error("Invalid Range axis tick arithmetic.");
  // The neutral source helper rounds crop limits; the raw Range scale admits only in-domain ticks.
  return raw.filter((v) => v >= visible[0] && v <= visible[1]);
}
export function planRangeValueAxis(input: RangeValueAxisInput): RangeValueAxisPlan {
  if (input === null || typeof input !== "object")
    throw Error("Invalid Range value axis input.");
  const window =
    input.visibleRange === undefined ? ([0, 1] as const) : input.visibleRange;
  validate(input, window);
  const baseDensity = input.density ?? linearTickDensity(input.span);
  const semantic = semanticExtent(input);
  const full = fullExtent(semantic, baseDensity);
  const visible = visibleExtent(full, window);
  const fraction = window[1] - window[0];
  const density =
    fraction > 0 && fraction < 1
      ? linearTickDensity(input.span, fraction)
      : baseDensity;
  if (!validDensity(density)) throw Error("Nonfinite Range axis tick density.");
  const rawTicks = ticks(full, visible, density, input.span);
  return {
    semanticExtent: semantic,
    fullExtent: full,
    visibleExtent: visible,
    rawTicks,
    density,
    span: input.span,
    valueScale: visible.length
      ? { min: visible[0], max: visible[1], ticks: rawTicks }
      : null,
  };
}
