import type { YAXisComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { alternatingGrid } from "./cartesianGrid";
import { histogramNiceExtent } from "./histogramNiceExtent";
import "./histogramAxisLabels";
import type { HistogramLabelAxisOption } from "./histogramAxisLabels";
import type { ResolvedXyAxis } from "./xyTypes";
import type { HistogramDomain, HistogramMappingInput, HistogramProjection } from "./histogramTypes";

function extent(spec: ResolvedXyAxis, low: number, high: number): readonly [number, number] {
  let min = spec.min ?? low, max = spec.max ?? high;
  if (min === max) {
    const delta = Math.max(1, Math.abs(min) * 0.05);
    if (spec.max === undefined) max += delta;
    else min -= delta;
  }
  if (!Number.isFinite(max - min) || !(min < max)) throw Error("Histogram extent is not representable.");
  return [min, max];
}
export function histogramDomain(projection: HistogramProjection): HistogramDomain {
  const { calculation: { bins, groups }, input } = projection;
  if (!bins.length) return { x: [0, 1], y: [0, 1], emptyAxes: ["x", "y"] };
  const x = [bins[0][0], bins[bins.length - 1][1]] as const;
  if (!(x[0] < x[1]) || !Number.isFinite(x[1] - x[0])) throw Error("Calculated first/last interval endpoints cannot establish an X domain.");
  const y: readonly [number, number] = [0, Math.max(0, ...groups.map(g => g.frequency))];
  const emptyAxes = (["x", "y"] as const).filter(id => {
    const spec = input.style.axes[id], domain = id === "x" ? x : y;
    return (spec.min !== undefined && spec.min > domain[1]) || (spec.max !== undefined && spec.max < domain[0]);
  });
  return {
    x: emptyAxes.includes("x") ? [0, 1] : extent(input.style.axes.x, ...x),
    y: emptyAxes.includes("y") ? [0, 1] : extent(input.style.axes.y, ...y),
    emptyAxes,
  };
}
function axis(input: HistogramMappingInput, id: "x" | "y", domain: HistogramDomain, pixels: number): HistogramLabelAxisOption {
  const a = input.style.axes[id].appearance;
  const [low, high] = domain[id];
  const extent = domain.emptyAxes.includes(id) ? { min: low, max: high }
    : histogramNiceExtent(low, high, pixels, input.style.axes[id]);
  // Check callback projections while diagnostics can still reject the option atomically.
  input.context.display.numericAxis(extent.min);
  input.context.display.numericAxis(extent.max);
  const formatter = (value: number) => String(input.context.display.numericAxis(value));
  return {
    type: "value", show: !domain.emptyAxes.includes(id), scale: true, ...extent,
    ...(id === "x" ? { openbbHistogramLabels: { formatter, font: a.labels,
      paddingRight: input.style.application.padding.right } } : {}),
    position: a.fields.position as "bottom" | "top",
    name: a.title.enabled ? a.title.text : "", nameLocation: "middle",
    nameGap: a.title.spacing + a.labels.size + a.labels.padding, nameTextStyle: fontStyle(a.title),
    axisLabel: { ...fontStyle(a.labels), margin: a.labels.padding, rotate: a.labels.rotation ?? 0,
      formatter },
    axisLine: { show: a.lineEnabled, lineStyle: { color: a.fields.color, width: a.fields.thickness } },
    axisTick: { show: a.ticks.enabled, length: a.ticks.length,
      lineStyle: { color: a.ticks.color, width: a.ticks.width } },
    splitLine: { show: a.grid.enabled && !alternatingGrid(a), lineStyle: {
      color: a.gridStyles.map(s => s.stroke), width: a.grid.thickness, type: [...a.gridStyles[0].lineDash] } },
  };
}
export function histogramAxes(input: HistogramMappingInput, domain: HistogramDomain, pixels: Readonly<Record<"x" | "y", number>>) {
  const axes = (["x", "y"] as const).flatMap(id => {
    const a = input.style.axes[id].appearance;
    return a.grid.enabled && alternatingGrid(a) && !domain.emptyAxes.includes(id)
      ? [{ axis: id === "x" ? "xAxis" : "yAxis", width: a.grid.thickness, styles: a.gridStyles }] : [];
  });
  return { xAxis: axis(input, "x", domain, pixels.x), yAxis: axis(input, "y", domain, pixels.y) as YAXisComponentOption,
    ...(axes.length ? { qopenbbGrid: { axes } } : {}) };
}
