import type { LinearTickDensity } from "./linearTicks";
import type { RangeNumericAxisPolicy } from "./rangeApplicationTypes";
import { planRangeNumericAxis } from "./rangeNumericAxis";
import type { ResolvedRangeBarScale } from "./rangeBarTypes";

type Extent = readonly [] | readonly [number, number];
export interface RangeValueAxisInput {
  readonly dataExtent: Extent;
  readonly bounds: { readonly min?: number; readonly max?: number };
  readonly span: number;
  readonly density?: LinearTickDensity;
  readonly visibleRange?: readonly [number, number];
  readonly policy?: RangeNumericAxisPolicy;
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
export function planRangeValueAxis(input: RangeValueAxisInput): RangeValueAxisPlan {
  if (input === null || typeof input !== "object")
    throw Error("Invalid Range value axis input.");
  const window =
    input.visibleRange === undefined ? ([0, 1] as const) : input.visibleRange;
  validate(input, window);
  const policy = input.policy ?? { nice: true, reverse: false, interval: {} };
  const numeric = {
    domain: {
      mode: "full" as const,
      dataExtent: input.policy ? input.dataExtent : semanticExtent(input),
    },
    policy: input.policy
      ? {
          ...policy,
          ...(input.bounds.min === undefined ? {} : { min: input.bounds.min }),
          ...(input.bounds.max === undefined ? {} : { max: input.bounds.max }),
        }
      : policy,
    span: input.span,
    visibleRange: [0, 1] as const,
    density: input.density,
    preserveConstant: true,
  };
  const full = planRangeNumericAxis(numeric);
  // Navigation crops the accepted full domain; legacy custom density only chose that full domain.
  const { min: _min, max: _max, ...windowPolicy } = numeric.policy;
  const planned =
    window[0] === 0 && window[1] === 1
      ? full
      : planRangeNumericAxis({
          ...numeric,
          domain: { mode: "window", fullExtent: full.fullExtent },
          policy: windowPolicy,
          density: undefined,
          visibleRange: window,
        });
  const visible = planned.visibleExtent;
  return {
    ...planned,
    semanticExtent: full.semanticExtent,
    span: input.span,
    valueScale: visible.length
      ? {
          min: visible[0],
          max: visible[1],
          ticks: planned.rawTicks,
          ...(input.policy === undefined ? {} : { reverse: input.policy.reverse }),
        }
      : null,
  };
}
