import type { LegendComponentOption } from "echarts";
import { boxDisplayText } from "./boxPlotAdmission";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { markerSymbol } from "./cartesianMarkers";

function legendSpace(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
): number {
  const l = input.style.application.legend;
  const vertical = l.position === "left" || l.position === "right";
  const sizes = projection.fields.map((f) =>
    measureText(boxDisplayText(input.context.display.legend(f.descriptor.label)), l),
  );
  if (!l.enabled || sizes.length === 0) return 0;
  const widths = sizes.map((s) => s.width + l.markerSize + l.itemSpacing);
  const height = Math.max(l.markerSize, ...sizes.map((s) => s.height));
  const available =
    input.context.viewport.width -
    input.style.application.padding.left -
    input.style.application.padding.right;
  const rows = Math.max(
    1,
    Math.ceil(
      (widths.reduce((n, w) => n + w, 0) + (sizes.length - 1) * l.horizontalSpacing) /
        Math.max(1, available),
    ),
  );
  return (
    l.spacing +
    (vertical ? Math.max(...widths) : rows * height + (rows - 1) * l.verticalSpacing)
  );
}
export function boxPlotLayout(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
) {
  const a = input.style.application;
  const l = a.legend;
  const position = l.position as keyof typeof a.padding;
  const vertical = position === "left" || position === "right";
  const captions = [a.title, a.subtitle].filter((c) => c.enabled && c.text !== "");
  const captionSpace = captions.reduce(
    (n, c) => n + measureText(c.text, c).height + c.spacing,
    0,
  );
  const padding = { ...a.padding, top: a.padding.top + captionSpace };
  padding[position] += legendSpace(input, projection);
  const labels = new Map(
    projection.fields.map((f) => [
      f.descriptor.id,
      boxDisplayText(input.context.display.legend(f.descriptor.label)),
    ]),
  );
  const legend: LegendComponentOption = {
    show: l.enabled,
    data: projection.fields.map((f) => ({
      name: f.descriptor.id,
      icon: markerSymbol("square"),
    })),
    selected: { ...input.context.legendSelection },
    formatter: (id) => labels.get(id) ?? "",
    orient: vertical ? "vertical" : "horizontal",
    [position]: a.padding[position] + (position === "top" ? captionSpace : 0),
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
      itemGap: a.title.enabled && a.title.text !== "" ? a.title.spacing : 0,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    grid: { ...padding, containLabel: true },
  };
}
