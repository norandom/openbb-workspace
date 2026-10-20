import type { LegendComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { markerSymbol } from "./cartesianMarkers";
import type { XyMappingInput } from "./xyTypes";
function legends(input: XyMappingInput): Map<string, string> {
  const columns = new Map(input.snapshot.columns.map((c) => [c.id, c.label]));
  return new Map(
    input.assignments.map((a) => [
      a.yColId,
      `${columns.get(a.yColId)} vs ${columns.get(a.xColId)}`,
    ]),
  );
}
function legendSpace(
  input: XyMappingInput,
  labels: Map<string, string>,
): number {
  const l = input.style.application.legend;
  const sizes = [...labels.values()].map((label) =>
    measureText(String(input.context.display.legend(label)), l),
  );
  if (l.position === "left" || l.position === "right")
    return (
      Math.max(0, ...sizes.map((s) => s.width)) + l.markerSize + l.itemSpacing
    );
  const width = Math.max(
    1,
    input.context.viewport.width -
      input.style.application.padding.left -
      input.style.application.padding.right,
  );
  let rows = sizes.length ? 1 : 0,
    used = 0;
  for (const s of sizes) {
    const item = s.width + l.markerSize + l.itemSpacing + l.horizontalSpacing;
    if (used && used + item > width) {
      rows++;
      used = 0;
    }
    used += item;
  }
  return (
    rows *
    (Math.max(l.markerSize, ...sizes.map((s) => s.height), 0) +
      l.verticalSpacing)
  );
}
export function xyLayout(input: XyMappingInput) {
  const a = input.style.application,
    l = a.legend,
    labels = legends(input);
  const position = l.position as keyof typeof a.padding;
  const captions = [a.title, a.subtitle].filter(
    (c) => c.enabled && c.text !== "",
  );
  const captionSpace = captions.reduce(
    (n, c) => n + measureText(c.text, c).height + c.spacing,
    0,
  );
  const padding = { ...a.padding, top: a.padding.top + captionSpace };
  if (l.enabled) padding[position] += legendSpace(input, labels) + l.spacing;
  const vertical = l.position === "left" || l.position === "right";
  const legend: LegendComponentOption = {
    show: l.enabled,
    data: [...labels.keys()].map((name) => ({
      name,
      icon: markerSymbol(input.style.series.markers.shape),
    })),
    selected: { ...input.context.legendSelection },
    formatter: (name) =>
      String(input.context.display.legend(labels.get(name) ?? name)),
    orient: vertical ? "vertical" : "horizontal",
    [l.position]:
      a.padding[position] + (l.position === "top" ? captionSpace : 0),
    ...(vertical ? { top: "middle" } : { left: "center" }),
    textStyle: fontStyle(l),
    itemWidth: l.markerSize,
    itemHeight: l.markerSize,
    itemGap: vertical ? l.verticalSpacing : l.horizontalSpacing,
    itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
  };
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    legend,
    title: {
      show: a.title.enabled || a.subtitle.enabled,
      text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "",
      textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle),
      itemGap: a.title.spacing,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    grid: { ...padding, containLabel: true },
  };
}
