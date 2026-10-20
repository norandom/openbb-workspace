import type { LegendComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { histogramNiceExtent } from "./histogramNiceExtent";
import type { HistogramDomain, HistogramMappingInput, HistogramProjection } from "./histogramTypes";

type HistogramGrid = { readonly left?: number | string; readonly right?: number | string;
  readonly top?: number | string; readonly bottom?: number | string };

function axisFootprint(input: HistogramMappingInput, id: "x" | "y", domain: HistogramDomain): number {
  if (domain.emptyAxes.includes(id)) return 0;
  const a = input.style.axes[id].appearance;
  const angle = (a.labels.rotation ?? 0) * Math.PI / 180;
  const labels = Math.max(...domain[id].map(value => {
    const size = measureText(String(input.context.display.numericAxis(value)), a.labels);
    return id === "x" ? Math.abs(size.width * Math.sin(angle)) + Math.abs(size.height * Math.cos(angle))
      : Math.abs(size.width * Math.cos(angle)) + Math.abs(size.height * Math.sin(angle));
  }));
  const ticks = a.ticks.enabled ? a.ticks.length : 0;
  const title = a.title.enabled && a.title.text
    ? a.title.spacing + measureText(a.title.text, a.title).height : 0;
  return labels + a.labels.padding + ticks + title;
}
function axisPixels(input: HistogramMappingInput, grid: HistogramGrid, domain: HistogramDomain) {
  const margin = (side: keyof HistogramGrid) => typeof grid[side] === "number" ? grid[side] as number : 0;
  return {
    x: Math.max(0, input.context.viewport.width - margin("left") - margin("right") - axisFootprint(input, "y", domain)),
    y: Math.max(0, input.context.viewport.height - margin("top") - margin("bottom") - axisFootprint(input, "x", domain)),
  };
}
/** Estimate usable spans without changing the grid; ECharts still owns the final label layout. */
export function histogramAxisPixels(input: HistogramMappingInput, grid: HistogramGrid, domain: HistogramDomain) {
  const pixels = axisPixels(input, grid, domain);
  const provisional = (id: "x" | "y"): readonly [number, number] => {
    if (domain.emptyAxes.includes(id)) return domain[id];
    const nice = histogramNiceExtent(...domain[id], pixels[id], input.style.axes[id]);
    return [nice.min, nice.max];
  };
  return axisPixels(input, grid, { ...domain, x: provisional("x"), y: provisional("y") });
}

export function histogramLayout({ input, field }: HistogramProjection) {
  const a = input.style.application, l = a.legend;
  const position = l.position as keyof typeof a.padding;
  const captions = [a.title, a.subtitle].filter(c => c.enabled && c.text !== "");
  const captionSpace = captions.reduce((n, c) => n + measureText(c.text, c).height + c.spacing, 0);
  const padding = { ...a.padding, top: a.padding.top + captionSpace };
  const vertical = position === "left" || position === "right";
  const label = measureText("Frequency", l);
  if (l.enabled && field) padding[position] += l.spacing + (vertical
    ? label.width + l.markerSize + l.itemSpacing
    : Math.max(label.height, l.markerSize) + l.verticalSpacing);
  const legend: LegendComponentOption = {
    show: l.enabled, data: field ? [{ name: field.id, icon: "rect" }] : [],
    selected: { ...input.context.legendSelection }, formatter: () => "Frequency",
    orient: vertical ? "vertical" : "horizontal",
    [position]: a.padding[position] + (position === "top" ? captionSpace : 0),
    ...(vertical ? { top: "middle" } : { left: "center" }),
    textStyle: fontStyle(l), itemWidth: l.markerSize, itemHeight: l.markerSize,
    itemGap: vertical ? l.verticalSpacing : l.horizontalSpacing,
    itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
  };
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent", legend,
    title: { show: a.title.enabled || a.subtitle.enabled, text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "", textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle), itemGap: a.title.spacing, padding: 0, top: a.padding.top, left: "center" },
    grid: { ...padding, containLabel: true },
  };
}
