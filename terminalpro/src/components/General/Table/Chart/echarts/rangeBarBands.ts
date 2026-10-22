import type { RangeBarMappingInput } from "./rangeBarTypes";
import {
  rangeCategoryEngineCoordinate,
  rangeContinuousBandwidth,
} from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

export function rangeBarCategoryCoordinate(
  plan: RangeCategoryPlan,
  slot: number,
): number | null {
  const coordinate = plan.coordinates[slot];
  const extent = plan.visibleExtent;
  if (coordinate === null || coordinate === undefined || extent.length === 0)
    return null;
  if (extent[0] === extent[1] && coordinate !== extent[0]) return null;
  return rangeCategoryEngineCoordinate(plan, coordinate);
}

function categoryWidth(
  span: number,
  plan: RangeCategoryPlan,
  input: RangeBarMappingInput,
): number {
  if (plan.kind !== "category") return rangeContinuousBandwidth(plan, span);
  const expanded = span / plan.visibleFraction;
  const b = input.style.band;
  const count = plan.coordinates.length;
  return count === 1
    ? expanded * (1 - 2 * b.paddingOuter)
    : (expanded / Math.max(1, count - b.paddingInner + 2 * b.paddingOuter)) *
        (1 - b.paddingInner);
}

/** Source peer rounding remains ordinal; continuous peers use zero padding. */
export function rangeBarBand(
  span: number,
  plan: RangeCategoryPlan,
  input: RangeBarMappingInput,
  count: number,
  index: number,
) {
  const width = categoryWidth(span, plan, input);
  const padding = plan.kind === "category" ? input.style.band.groupPaddingInner : 0;
  const inner = count === 1 ? 0 : padding;
  const rawStep = width / Math.max(1, count - inner);
  const round = padding !== 0;
  const step = round ? Math.floor(rawStep) : rawStep;
  const rawInset = (width - step * (count - inner)) / 2;
  const inset = round ? Math.round(rawInset) : rawInset;
  const bandwidth = round ? Math.round(step * (1 - inner)) : step * (1 - inner);
  const peerWidth = bandwidth >= 1 ? bandwidth : rawStep * (1 - inner);
  return {
    offset: Math.max(0, Math.min(width, inset + index * step)),
    width: peerWidth,
    centering: (plan.kind === "category" ? width : peerWidth) / 2,
  };
}
