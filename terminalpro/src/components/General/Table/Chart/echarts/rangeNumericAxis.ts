import {
  type LinearTickDensity,
  linearRawTicks,
  niceLinearExtent,
} from "./linearTicks";
import type {
  Extent,
  RangeNumericAxisInput,
  RangeNumericAxisResult,
} from "./rangeApplicationTypes";
import {
  checkedRangeExtent,
  normalizedRangeTicks,
  RANGE_TICK_BUDGET,
  rangeAxisDensity,
  rangeSemanticExtent,
  rangeVisibleExtent,
  validateRangeAxis,
} from "./rangeAxisValidation";

function validate(input: RangeNumericAxisInput) {
  validateRangeAxis(input, true);
  if (typeof input.preserveConstant !== "boolean")
    throw Error("Invalid Range numeric axis constant policy.");
  const step = input.policy.interval.step;
  if (
    step !== undefined &&
    (typeof step !== "number" || !Number.isFinite(step) || step <= 0)
  )
    throw Error("Invalid Range numeric axis step.");
}
function fullDomain(
  input: RangeNumericAxisInput,
  semantic: Extent,
  density: LinearTickDensity,
): Extent {
  if (
    !semantic.length ||
    input.domain.mode === "window" ||
    !input.policy.nice ||
    (input.preserveConstant && semantic[0] === semantic[1])
  )
    return semantic;
  const step = input.policy.interval.step;
  if (step === undefined || density.tickCount <= 1)
    return checkedRangeExtent(niceLinearExtent(semantic, density));
  return checkedRangeExtent([
    Math.floor(semantic[0] / step) * step,
    Math.ceil(semantic[1] / step) * step,
  ]);
}
function intervalTicks(
  full: readonly [number, number],
  step: number,
  visible: Extent,
): number[] {
  if (full[0] === full[1]) return [full[0]];
  const first = full[0];
  const last = full[1];
  const count = Math.max(0, Math.floor((last - first) / step + 1e-10) + 1);
  if (
    !Number.isFinite(count) ||
    count > RANGE_TICK_BUDGET ||
    !Number.isFinite(first) ||
    !Number.isFinite(last)
  )
    throw Error("Unsupported Range numeric axis explicit step arithmetic.");
  const [mantissa, exponent = "0"] = String(step).split("e");
  const digits = Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
  const factor = 10 ** digits;
  if (!Number.isFinite(factor))
    throw Error("Unsupported Range numeric axis step precision.");
  return normalizedRangeTicks(
    Array.from(
      { length: count },
      (_, i) => Math.round((first + i * step) * factor) / factor,
    ),
    visible,
  );
}
function rawTicks(
  input: RangeNumericAxisInput,
  full: Extent,
  visible: Extent,
  density: LinearTickDensity,
): number[] {
  if (!full.length || !visible.length || input.span === 0) return [];
  const { step, values } = input.policy.interval;
  if (values !== undefined) return normalizedRangeTicks(values, visible);
  if (density.tickCount === 0) return [];
  const fraction = input.visibleRange[1] - input.visibleRange[0];
  const available = fraction > 0 ? input.span / fraction : input.span;
  if (!Number.isFinite(available))
    throw Error("Nonfinite Range numeric axis pixel range.");
  if (step !== undefined && (full[1] - full[0]) / step < available)
    return intervalTicks(full, step, visible);
  return normalizedRangeTicks(linearRawTicks(full, density, visible), visible);
}
export function planRangeNumericAxis(
  input: RangeNumericAxisInput,
): RangeNumericAxisResult {
  validate(input);
  const baseDensity = rangeAxisDensity(input);
  const semanticExtent = rangeSemanticExtent(input);
  const fullExtent = fullDomain(input, semanticExtent, baseDensity);
  const visibleExtent = rangeVisibleExtent(fullExtent, input.visibleRange);
  const fraction = input.visibleRange[1] - input.visibleRange[0];
  const density =
    fraction > 0 && fraction < 1 ? rangeAxisDensity(input, fraction) : baseDensity;
  return {
    semanticExtent,
    fullExtent,
    visibleExtent,
    density,
    rawTicks: rawTicks(input, fullExtent, visibleExtent, density),
  };
}
