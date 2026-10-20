import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { measureText } from "./cartesianLayout";

type NumericAxis = Extract<XAXisComponentOption | YAXisComponentOption, { type?: "value" }>;
type PlotGrid = { left?: unknown; right?: unknown; top?: unknown; bottom?: unknown; containLabel?: boolean };
const finiteStep = (step: unknown): step is number =>
  typeof step === "number" && Number.isFinite(step) && step > 0;

function tickValues(min: number, max: number, step: number): number[] | undefined {
  const first = Math.ceil(min / step), last = Math.floor(max / step);
  if (![first, last].every(Number.isFinite) || last - first > 254) return;
  const values = [min];
  for (let i = 0; i <= last - first; i++) {
    const value = (first + i) * step;
    if (value > min && value < max) values.push(value);
  }
  if (max > min) values.push(max);
  return values;
}
function nextStep(step: number): number {
  const power = 10 ** Math.floor(Math.log10(step));
  const ratio = step / power;
  return power * (ratio < 2 - 1e-10 ? 2 : ratio < 5 - 1e-10 ? 5 : 10);
}
function labelSize(axis: NumericAxis, value: number, index: number) {
  const label = axis.axisLabel ?? {};
  const formatter = label.formatter;
  const text = typeof formatter === "function" ? formatter(value, index, undefined)
    : typeof formatter === "string" ? formatter.replace("{value}", String(value)) : String(value);
  const size = measureText(String(text), {
    font: label.fontFamily ?? "sans-serif", size: Number(label.fontSize ?? 12),
    fontStyle: label.fontStyle, fontWeight: label.fontWeight,
  });
  const angle = Number(label.rotate ?? 0) * Math.PI / 180;
  return { width: Math.abs(size.width * Math.cos(angle)) + Math.abs(size.height * Math.sin(angle)),
    height: Math.abs(size.width * Math.sin(angle)) + Math.abs(size.height * Math.cos(angle)) };
}
function tickLabels(axis: NumericAxis, step: number, horizontal: boolean) {
  const values = tickValues(Number(axis.min), Number(axis.max), step);
  return values?.map((value, index) => ({ value,
    size: labelSize(axis, value, index)[horizontal ? "width" : "height"] }));
}
/** The domain is frozen before selecting a sparser interval; labels never move observations. */
export function xyTickAxis<T extends NumericAxis>(
  axis: T, pixels: number, horizontal: boolean, before = 0, after = 0,
): T {
  const min = Number(axis.min), max = Number(axis.max);
  let step = axis.interval;
  if (!finiteStep(step) || !Number.isFinite(max - min) || !(max > min))
    return { ...axis, interval: finiteStep(step) ? step : undefined };
  const first = labelSize(axis, min, 0).width, last = labelSize(axis, max, 0).width;
  const showMaxLabel = !horizontal || last / 2 <= after;
  const showMinLabel = !horizontal || showMaxLabel && first / 2 <= before;
  for (let attempt = 0; attempt < 64; attempt++) {
    const labels = tickLabels(axis, step, horizontal)?.filter(({ value }) =>
      (value !== min || showMinLabel) && (value !== max || showMaxLabel));
    const overlap = labels?.some((label, index) => index > 0 &&
      (label.value - labels[index - 1].value) / (max - min) * Math.max(1, pixels)
        < (label.size + labels[index - 1].size) / 2 + 10);
    if (labels && !overlap) break;
    const next = nextStep(step);
    if (!finiteStep(next) || next <= step) break;
    step = next;
  }
  return { ...axis, interval: step, axisLabel: { ...axis.axisLabel,
    hideOverlap: true, showMinLabel, showMaxLabel } };
}
/** containLabel reserves the perpendicular numeric labels inside the supplied grid margins. */
export function xyPlotGeometry(y: NumericAxis, grid: PlotGrid, width: number) {
  let left = Number(grid.left ?? 0), right = Number(grid.right ?? 0);
  if (grid.containLabel && y.show !== false && y.axisLabel?.show !== false && !y.axisLabel?.inside) {
    const labels = finiteStep(y.interval) ? tickLabels(y, y.interval, true) : undefined;
    const footprint = Math.max(0, ...(labels ?? []).map(label => label.size)) + Number(y.axisLabel?.margin ?? 8);
    if (y.position === "right") right += footprint;
    else left += footprint;
  }
  return { pixels: Math.max(1, width - left - right), before: left, after: right };
}
/** Main-grid margins already include captions, legend and the complete navigator track. */
export function xyVerticalPixels(x: NumericAxis, grid: PlotGrid, height: number) {
  let outward = 0;
  if (grid.containLabel && x.show !== false) {
    const labels = finiteStep(x.interval) ? tickLabels(x, x.interval, false) : undefined;
    const label = x.axisLabel?.show === false || x.axisLabel?.inside ? 0
      : Math.max(0, ...(labels ?? []).map(item => item.size)) + Number(x.axisLabel?.margin ?? 8);
    const ticks = x.axisTick?.show ? Number(x.axisTick.length ?? 5) : 0;
    const name = x.name ? Number(x.nameGap ?? 15) + Number(x.nameTextStyle?.fontSize ?? 12) : 0;
    outward = Math.max(label, ticks, name);
  }
  return Math.max(1, height - Number(grid.top ?? 0) - Number(grid.bottom ?? 0) - outward);
}
