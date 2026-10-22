import type {
  RangeContinuousCategoryInput,
  RangeContinuousCategoryResult,
  RangeNumericAxisPolicy,
} from "./rangeApplicationTypes";
import { validateRangeAxis } from "./rangeAxisValidation";
import {
  planRangeCalendar,
  rangeNumericCategoryFormatter,
} from "./rangeCalendarAdapter";
import { rangeCalendarLabels } from "./rangeCalendarLabels";
import { planRangeNumericAxis } from "./rangeNumericAxis";

export function planRangeContinuousCategory(
  input: RangeContinuousCategoryInput,
): RangeContinuousCategoryResult {
  validateRangeAxis(input, false);
  if (input.labelFormat !== undefined && typeof input.labelFormat !== "string")
    throw Error("Unsupported Range category axis label format.");
  if (input.kind !== "number" && input.kind !== "time")
    throw Error("Invalid Range continuous category axis kind.");
  if (input.kind === "time") {
    const plan = planRangeCalendar(input);
    return {
      rawTicks: plan.rawTicks,
      density: plan.density,
      reverse: input.policy.reverse,
      category: {
        kind: "time",
        reverse: input.policy.reverse,
        fullExtent: plan.fullExtent,
        visibleRange: input.visibleRange,
        ticks: rangeCalendarLabels(plan, input.labelFormat),
      },
    };
  }
  const step = input.policy.interval.step;
  if (step !== undefined && typeof step !== "number")
    throw Error("Invalid Range numeric category axis step.");
  const policy: RangeNumericAxisPolicy = {
    ...input.policy,
    interval: { ...input.policy.interval, step },
  };
  const plan = planRangeNumericAxis({ ...input, policy, preserveConstant: false });
  const formatter = rangeNumericCategoryFormatter(input.labelFormat);
  return {
    rawTicks: plan.rawTicks,
    density: plan.density,
    reverse: input.policy.reverse,
    category: {
      kind: "number",
      reverse: input.policy.reverse,
      fullExtent: plan.fullExtent,
      visibleRange: input.visibleRange,
      ticks: plan.rawTicks.map((coordinate) => ({
        coordinate,
        label: formatter(coordinate),
      })),
    },
  };
}
