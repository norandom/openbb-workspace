import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import type {
  RangeBarAxisPaint,
  RangeBarMappingInput,
  RangeBarText,
} from "./rangeBarTypes";
import {
  rangeCategoryEngineCoordinate,
  rangeCategoryExactSlot,
  rangeCategoryTransport,
} from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

export function rangeCoordinate(value: number, input: RangeBarMappingInput): number {
  const scale = input.style.valueScale;
  return scale === null || scale.min === scale.max ? 0.5 : value;
}
export function rangeTransport(input: RangeBarMappingInput): readonly [number, number] {
  const s = input.style.valueScale;
  return s === null || s.min === s.max ? [0, 1] : [s.min, s.max];
}
function appearance(a: RangeBarAxisPaint) {
  return {
    type: "value" as const,
    scale: true,
    position: a.fields.position as "top" | "bottom",
    axisLine: {
      show: a.lineEnabled,
      onZero: false,
      lineStyle: { color: a.fields.color, width: a.fields.thickness },
    },
    axisTick: {
      show: a.ticks.enabled,
      length: a.ticks.length,
      lineStyle: { color: a.ticks.color, width: a.ticks.width },
    },
    axisLabel: {
      ...fontStyle(a.labels),
      margin: a.labels.padding,
      rotate: -(a.labels.rotation ?? 0),
    },
    splitLine: { show: false },
    minorTick: { show: false },
    minorSplitLine: { show: false },
  };
}
function categoryAxis(
  input: RangeBarMappingInput,
  text: RangeBarText,
  category: RangeCategoryPlan,
): XAXisComponentOption {
  const base = appearance(input.style.categoryAxis);
  const [min, max] = rangeCategoryTransport(category) ?? [0, 1];
  const ticks = new Map(
    category.ticks.map((t) => [
      rangeCategoryEngineCoordinate(category, t.coordinate),
      t.label,
    ]),
  );
  const at = (v: unknown) => {
    const slot = typeof v === "number" ? rangeCategoryExactSlot(category, v) : null;
    return slot === null ? "" : text.pointers[slot];
  };
  return {
    ...base,
    min,
    max,
    inverse: (input.style.direction === "horizontal") !== (category.reverse ?? false),
    axisLabel: {
      ...base.axisLabel,
      customValues: [...ticks.keys()],
      formatter: (v: number) => ticks.get(v) ?? "",
    },
    axisTick: { ...base.axisTick, customValues: [...ticks.keys()] },
    axisPointer: {
      snap: true,
      label: {
        show: category.coordinates.some((c) => c !== null),
        formatter: (p) => at(p.value),
      },
    },
  };
}
function numberAxis(
  input: RangeBarMappingInput,
  text: RangeBarText,
): XAXisComponentOption {
  const base = appearance(input.style.numberAxis);
  const [min, max] = rangeTransport(input);
  const ticks = [...text.ticks.keys()];
  return {
    ...base,
    min,
    max,
    axisLabel: {
      ...base.axisLabel,
      customValues: [...ticks],
      formatter: (v: number) => text.ticks.get(v) ?? "",
    },
    axisTick: { ...base.axisTick, customValues: [...ticks] },
    inverse: input.style.valueScale?.reverse ?? false,
    axisPointer: { label: { show: false } },
  };
}
export function rangeBarAxes(
  input: RangeBarMappingInput,
  text: RangeBarText,
  category: RangeCategoryPlan,
) {
  const c = categoryAxis(input, text, category);
  const n = numberAxis(input, text);
  const vertical = input.style.direction === "vertical";
  return { xAxis: vertical ? c : n, yAxis: (vertical ? n : c) as YAXisComponentOption };
}
