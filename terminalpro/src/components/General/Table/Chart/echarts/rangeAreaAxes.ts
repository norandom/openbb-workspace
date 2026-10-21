import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import type {
  RangeBarAxisPaint,
  RangeBarProjection,
  RangeBarText,
} from "./rangeBarTypes";

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
export function rangeCategoryDomain(
  input: RangeAreaMappingInput,
  count: number,
): readonly [number, number] {
  const b = input.style.band;
  const c = b.paddingOuter + (1 - b.paddingInner) / 2;
  return count > 1 ? [-c, count - 1 + c] : [-0.5, 0.5];
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
  projection: RangeBarProjection,
  text: RangeBarText,
): XAXisComponentOption {
  const base = appearance(input.style.categoryAxis);
  const [min, max] = rangeCategoryDomain(input, projection.groups.length);
  const slots = projection.groups.map((g) => g.slot);
  const at = (v: unknown, values: readonly string[]) =>
    typeof v === "number" && Number.isInteger(v) ? (values[v] ?? "") : "";
  return {
    ...base,
    min,
    max,
    inverse: false,
    axisLabel: {
      ...base.axisLabel,
      customValues: [...slots],
      formatter: (v: number) => at(v, text.categories),
    },
    axisTick: { ...base.axisTick, customValues: [...slots] },
    axisPointer: {
      snap: true,
      label: { show: slots.length > 0, formatter: (p) => at(p.value, text.pointers) },
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
    axisPointer: { label: { show: false } },
  };
}
export function rangeAreaAxes(
  input: RangeAreaMappingInput,
  projection: RangeBarProjection,
  text: RangeBarText,
) {
  const c = categoryAxis(input, projection, text);
  const n = numberAxis(input, text);
  return { xAxis: c, yAxis: n as YAXisComponentOption };
}
