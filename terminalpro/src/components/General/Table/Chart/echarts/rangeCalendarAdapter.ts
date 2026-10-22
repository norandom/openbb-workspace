import { _ModuleSupport } from "ag-charts-community";
import type { Extent, RangeContinuousCategoryInput } from "./rangeApplicationTypes";
import {
  checkedRangeExtent,
  normalizedRangeTicks,
  RANGE_TICK_BUDGET,
  rangeAxisDensity,
  rangeSemanticExtent,
  rangeVisibleExtent,
  validateRangeAxis,
} from "./rangeAxisValidation";

// Community 12.1.1 MIT pure utilities only; ECharts owns all rendering and scenes.
const {
  TimeScale,
  FormatManager,
  intervalRangeCount,
  lowestGranularityUnitForTicks,
  dateTruncationForDomain,
  intervalUnit,
  intervalStep,
  intervalEpoch,
  intervalMilliseconds,
} = _ModuleSupport;
type NativeInterval = NonNullable<
  Parameters<InstanceType<typeof TimeScale>["niceDomain"]>[0]["interval"]
>;
type CalendarInterval = Exclude<NativeInterval, number>;
interface CalendarDescriptor extends Omit<CalendarInterval, "epoch"> {
  readonly epoch?: number;
}
const UNITS = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
  "month",
  "year",
] as const;
export interface RangeCalendarPlan {
  readonly fullExtent: Extent;
  readonly visibleExtent: Extent;
  readonly rawTicks: readonly number[];
  readonly density: ReturnType<typeof rangeAxisDensity>;
  readonly interval?: CalendarDescriptor;
}
function validDate(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
}
function dateExtent(extent: Extent): Extent {
  if (extent.some((value) => !validDate(value)))
    throw Error("Invalid Range calendar axis Date extent.");
  return checkedRangeExtent(extent);
}
function nativeInterval(
  step: RangeContinuousCategoryInput["policy"]["interval"]["step"],
): NativeInterval | undefined {
  if (step === undefined) return undefined;
  if (typeof step === "number") {
    if (!Number.isFinite(step) || step < 1)
      throw Error("Unsupported Range calendar axis millisecond step.");
    return step;
  }
  const value = typeof step === "string" ? { unit: step } : step;
  if (
    !value ||
    typeof value !== "object" ||
    !UNITS.some((unit) => unit === value.unit) ||
    Object.keys(value).some((key) => !["unit", "step", "epoch", "utc"].includes(key)) ||
    (value.step !== undefined && (!Number.isFinite(value.step) || value.step <= 0)) ||
    (value.utc !== undefined && typeof value.utc !== "boolean") ||
    (value.epoch !== undefined &&
      (typeof value.epoch !== "number" || !validDate(value.epoch)))
  )
    throw Error("Unsupported Range calendar axis interval.");
  const native = {
    ...value,
    unit: value.unit as CalendarInterval["unit"],
    epoch: value.epoch === undefined ? undefined : new Date(value.epoch),
  };
  if (intervalMilliseconds(native) < 1)
    throw Error("Unsupported Range calendar axis submillisecond step.");
  return native;
}
function validate(input: RangeContinuousCategoryInput): NativeInterval | undefined {
  validateRangeAxis(input, false);
  const data =
    input.domain.mode === "full" ? input.domain.dataExtent : input.domain.fullExtent;
  dateExtent(data);
  for (const value of [
    input.policy.min,
    input.policy.max,
    ...(input.policy.interval.values ?? []),
  ]) {
    if (value !== undefined && !validDate(value))
      throw Error("Invalid Range calendar axis Date value.");
  }
  return nativeInterval(input.policy.interval.step);
}
function intervalBudget(
  interval: NativeInterval | undefined,
  domain: Extent,
  available: number,
) {
  if (!domain.length || interval === undefined) return;
  // Numeric intervals reject density before traversal; object intervals allocate first.
  if (typeof interval === "number" && (domain[1] - domain[0]) / interval >= available)
    return;
  const count =
    typeof interval === "number"
      ? (domain[1] - domain[0]) / interval + 1
      : intervalRangeCount(interval, new Date(domain[0]), new Date(domain[1]), {
          extend: true,
        }) + 1;
  if (!Number.isFinite(count) || count > RANGE_TICK_BUDGET)
    throw Error("Unsupported Range calendar axis interval allocation.");
}
function calendarDescriptor(
  interval: CalendarInterval | undefined,
): CalendarDescriptor | undefined {
  if (interval === undefined) return undefined;
  const epoch = interval.epoch === undefined ? undefined : Number(interval.epoch);
  if (epoch !== undefined && !validDate(epoch))
    throw Error("Invalid Range calendar axis interval epoch.");
  return { ...interval, epoch };
}
function fullDomain(
  input: RangeContinuousCategoryInput,
  interval: NativeInterval | undefined,
): Extent {
  const semantic = dateExtent(rangeSemanticExtent(input));
  if (
    !semantic.length ||
    input.domain.mode === "window" ||
    !input.policy.nice ||
    input.span === 0
  )
    return semantic;
  intervalBudget(interval, semantic, input.span);
  const scale = new TimeScale();
  scale.range = [0, input.span];
  const params = { nice: true, interval, ...rangeAxisDensity(input) };
  return dateExtent(
    checkedRangeExtent(
      scale
        .niceDomain(
          params,
          semantic.map((v) => new Date(v)),
        )
        .map(Number) as [number, number],
    ),
  );
}
function calendarTicks(
  input: RangeContinuousCategoryInput,
  full: Extent,
  visible: Extent,
  interval: NativeInterval | undefined,
  density: RangeCalendarPlan["density"],
) {
  if (!full.length || input.span === 0) return { rawTicks: [] };
  const values = input.policy.interval.values;
  if (values !== undefined) return { rawTicks: normalizedRangeTicks(values, visible) };
  if (interval === undefined) {
    if (density.tickCount === 0) return { rawTicks: [] };
    if (full[0] === full[1]) return { rawTicks: [full[0]] };
  }
  const scale = new TimeScale();
  const fraction = input.visibleRange[1] - input.visibleRange[0];
  const available = input.span / fraction;
  if (!Number.isFinite(available))
    throw Error("Nonfinite Range calendar axis pixel range.");
  intervalBudget(interval, full, available);
  scale.range = [0, available];
  const result = scale.ticks(
    { nice: input.policy.nice, interval, ...density },
    full.map((v) => new Date(v)),
    [...input.visibleRange],
  );
  const raw = result?.ticks.map(Number) ?? [];
  if (raw.some((value) => !validDate(value)))
    throw Error("Invalid Range calendar axis decoded tick.");
  return {
    rawTicks: normalizedRangeTicks(raw, visible),
    interval: calendarDescriptor(result?.timeInterval),
  };
}
export function planRangeCalendar(
  input: RangeContinuousCategoryInput,
): RangeCalendarPlan {
  const interval = validate(input);
  const fullExtent = fullDomain(input, interval);
  const visibleExtent = dateExtent(rangeVisibleExtent(fullExtent, input.visibleRange));
  const density = rangeAxisDensity(
    input,
    input.visibleRange[1] - input.visibleRange[0],
  );
  const ticks = calendarTicks(input, fullExtent, visibleExtent, interval, density);
  return {
    fullExtent,
    visibleExtent,
    density,
    ...ticks,
  };
}
export function rangeNumericCategoryFormatter(
  format?: string,
): (value: number) => string {
  if (!format) return String;
  const formatter = FormatManager.getFormatter("number", format);
  if (!formatter) throw Error("Unsupported Range numeric category axis label format.");
  return (value) => formatter(value);
}
export function rangeCalendarFormatter(
  plan: RangeCalendarPlan,
  format?: string,
): (value: number) => string {
  const domain = plan.fullExtent.map((value) => new Date(value));
  const interval = plan.interval
    ? {
        ...plan.interval,
        epoch:
          plan.interval.epoch === undefined ? undefined : new Date(plan.interval.epoch),
      }
    : lowestGranularityUnitForTicks([...plan.rawTicks]);
  const manager = new FormatManager();
  const truncateDate = dateTruncationForDomain(domain);
  const context = {
    type: "date" as const,
    unit: intervalUnit(interval),
    step: intervalStep(interval),
    epoch: intervalEpoch(interval),
    style: "long" as const,
    source: "axis-label" as const,
    property: "x" as const,
    domain,
    boundSeries: [],
    datum: undefined,
    legendItemName: undefined,
    seriesId: undefined,
    key: undefined,
  };
  return (value) =>
    manager.defaultFormat(
      { ...context, value: new Date(value) },
      { specifier: format, truncateDate },
    );
}
