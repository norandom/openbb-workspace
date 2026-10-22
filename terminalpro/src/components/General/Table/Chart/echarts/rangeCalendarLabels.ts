import { type RangeCalendarPlan, rangeCalendarFormatter } from "./rangeCalendarAdapter";
import type { RangeCategoryTick } from "./rangeCategoryTypes";

export function rangeCalendarLabels(
  plan: RangeCalendarPlan,
  format?: string,
): readonly RangeCategoryTick[] {
  if (format !== undefined && typeof format !== "string")
    throw Error("Unsupported Range calendar axis label format.");
  if (plan.rawTicks.length === 0) return [];
  const formatter = rangeCalendarFormatter(plan, format);
  return plan.rawTicks.map((coordinate) => ({
    coordinate,
    label: formatter(coordinate),
  }));
}
