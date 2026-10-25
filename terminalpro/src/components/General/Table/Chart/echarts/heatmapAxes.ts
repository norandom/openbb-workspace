import type { HeatmapMappingInput } from "../application/heatmapTypes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { HeatmapData } from "./heatmapData";

function rotation(
  input: HeatmapMappingInput,
  model: HeatmapData,
  id: "x" | "y",
  length: number,
) {
  const label = input.style.axes[id].labels;
  if (label.rotation !== undefined) return -label.rotation;
  if (!label.autoRotate) return 0;
  const band = length / Math.max(1, model[id].length);
  const overlap = model[id].some((item) => {
    const size = measureText(String(input.context.display.category(item.label)), label);
    return (id === "x" ? size.width : size.height) + 10 > band;
  });
  return overlap ? 25 : 0;
}
function labelExtent(
  input: HeatmapMappingInput,
  model: HeatmapData,
  id: "x" | "y",
  angle: number,
) {
  const radians = (angle * Math.PI) / 180;
  const sizes = model[id].map((item) => {
    const size = measureText(
      String(input.context.display.category(item.label)),
      input.style.axes[id].labels,
    );
    return {
      width:
        Math.abs(size.width * Math.cos(radians)) +
        Math.abs(size.height * Math.sin(radians)),
      height:
        Math.abs(size.width * Math.sin(radians)) +
        Math.abs(size.height * Math.cos(radians)),
    };
  });
  return {
    width: Math.max(0, ...sizes.map((size) => size.width)),
    height: Math.max(0, ...sizes.map((size) => size.height)),
  };
}
function titleSpace(input: HeatmapMappingInput, id: "x" | "y") {
  const a = input.style.axes[id];
  return a.title.enabled && a.title.text
    ? measureText(a.title.text, a.title).height + a.title.spacing
    : 0;
}
export function heatmapAxisSpace(
  input: HeatmapMappingInput,
  model: HeatmapData,
  width = input.context.viewport.width,
  height = input.context.viewport.height,
) {
  const x = input.style.axes.x;
  const y = input.style.axes.y;
  const yAngle = rotation(input, model, "y", height);
  const ySize = labelExtent(input, model, "y", yAngle);
  const left =
    ySize.width +
    y.labels.padding +
    (y.ticks.enabled ? y.ticks.length : 0) +
    titleSpace(input, "y");
  const xAngle = rotation(input, model, "x", Math.max(0, width - left));
  const xSize = labelExtent(input, model, "x", xAngle);
  return {
    bottom:
      xSize.height +
      x.labels.padding +
      (x.ticks.enabled ? x.ticks.length : 0) +
      titleSpace(input, "x"),
    left,
  };
}
function axis(
  input: HeatmapMappingInput,
  model: HeatmapData,
  id: "x" | "y",
  plot: { width: number; height: number },
) {
  const a = input.style.axes[id];
  const items = model[id];
  const rotate = rotation(input, model, id, id === "x" ? plot.width : plot.height);
  const extent = labelExtent(input, model, id, rotate);
  return {
    type: "category" as const,
    show: !!model.x.length && !!model.y.length,
    data: items.map((_, i) => i),
    inverse: id === "y",
    boundaryGap: true,
    position: id === "x" ? ("bottom" as const) : ("left" as const),
    name: a.title.enabled ? a.title.text : "",
    nameLocation: "middle" as const,
    nameGap:
      a.title.spacing +
      (id === "x" ? extent.height : extent.width) +
      a.labels.padding +
      (a.ticks.enabled ? a.ticks.length : 0),
    nameTextStyle: fontStyle(a.title),
    axisLine: {
      show: a.lineEnabled,
      lineStyle: { color: a.fields.color, width: a.fields.thickness },
    },
    axisTick: {
      show: a.ticks.enabled,
      alignWithLabel: true,
      length: a.ticks.length,
      lineStyle: { color: a.ticks.color, width: a.ticks.width },
    },
    axisLabel: {
      ...fontStyle(a.labels),
      interval: 0,
      margin: a.labels.padding,
      rotate,
      formatter: (value: string) =>
        String(input.context.display.category(items[Number(value)]?.label ?? "")),
    },
    splitLine: { show: false },
    splitArea: { show: false },
  };
}
export function heatmapAxes(
  input: HeatmapMappingInput,
  model: HeatmapData,
  plot: { x: number; y: number; width: number; height: number },
) {
  return {
    grid: {
      left: plot.x,
      top: plot.y,
      width: plot.width,
      height: plot.height,
      containLabel: false,
    },
    xAxis: axis(input, model, "x", plot),
    yAxis: axis(input, model, "y", plot),
  };
}
