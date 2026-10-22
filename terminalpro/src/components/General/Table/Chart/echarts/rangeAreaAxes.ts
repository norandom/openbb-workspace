import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import type { RangeBarAxisPaint, RangeBarText } from "./rangeBarTypes";
import {
  rangeCategoryEngineCoordinate,
  rangeCategoryExactSlot,
  rangeCategoryTransport,
} from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

export function rangeCoordinate(value: number, input: RangeAreaMappingInput): number {
  const scale = input.style.valueScale;
  return scale === null || scale.min === scale.max ? 0.5 : value;
}
export function rangeTransport(
  input: RangeAreaMappingInput,
): readonly [number, number] {
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
  input: RangeAreaMappingInput,
  text: RangeBarText,
  category: RangeCategoryPlan,
): XAXisComponentOption {
  const base = appearance(input.style.categoryAxis);
  const [min, max] = rangeCategoryTransport(category) ?? [0, 1];
  const ticks = new Map(
    category.ticks.map((tick) => [
      rangeCategoryEngineCoordinate(category, tick.coordinate),
      tick.label,
    ]),
  );
  return {
    ...base,
    min,
    max,
    inverse: category.reverse ?? false,
    axisLabel: {
      ...base.axisLabel,
      customValues: [...ticks.keys()],
      formatter: (v: number) => ticks.get(v) ?? "",
    },
    axisTick: { ...base.axisTick, customValues: [...ticks.keys()] },
    axisPointer: {
      snap: true,
      label: {
        show: category.coordinates.some((v) => v !== null),
        formatter: (p) => {
          const slot =
            typeof p.value === "number"
              ? rangeCategoryExactSlot(category, p.value)
              : null;
          return slot === null ? "" : text.pointers[slot];
        },
      },
    },
  };
}
function numberAxis(
  input: RangeAreaMappingInput,
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
export function rangeAreaAxes(
  input: RangeAreaMappingInput,
  text: RangeBarText,
  category: RangeCategoryPlan,
) {
  const c = categoryAxis(input, text, category);
  const n = numberAxis(input, text);
  return { xAxis: c, yAxis: n as YAXisComponentOption };
}
