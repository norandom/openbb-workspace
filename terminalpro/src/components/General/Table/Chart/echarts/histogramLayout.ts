import type { LegendComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { HistogramProjection } from "./histogramTypes";

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
