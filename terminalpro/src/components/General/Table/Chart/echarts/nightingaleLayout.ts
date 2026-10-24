import type { EChartsOption } from "echarts";
import type { NightingaleMappingInput } from "../compatibility/nightingaleContracts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { linearTickDensity, niceLinearExtent, linearRawTicks } from "./linearTicks";
import type { NightingaleData } from "./nightingaleData";
function captionSpace(input: NightingaleMappingInput) {
  return [input.style.application.title, input.style.application.subtitle].reduce(
    (total, c) =>
      total + (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
}
function geometry(input: NightingaleMappingInput, data: NightingaleData) {
  const a = input.style.application;
  const p = { ...a.padding };
  p.top += captionSpace(input);
  if (a.legend.enabled) {
    const side = a.legend.position as keyof typeof p;
    const size =
      side === "left" || side === "right"
        ? Math.max(
            0,
            ...data.series.map(
              (s) =>
                measureText(String(input.context.display.legend(s.label)), a.legend)
                  .width,
            ),
          ) + 30
        : a.legend.size;
    p[side] += size + a.legend.spacing;
  }
  const room = Math.max(
    12,
    ...data.categories.map(
      (c) =>
        measureText(
          String(input.context.display.category(c)),
          input.style.polarAxis.labels,
        ).width /
          2 +
        22,
    ),
  );
  const width = Math.max(0, input.context.viewport.width - p.left - p.right);
  const height = Math.max(0, input.context.viewport.height - p.top - p.bottom);
  const radius = Math.max(0, Math.min(width, height) / 2 - room);
  return {
    center: [p.left + width / 2, p.top + height / 2] as [number, number],
    radius,
    inner: radius * input.style.polarAxis.innerRadiusRatio,
  };
}
function categoryLabels(
  input: NightingaleMappingInput,
  data: NightingaleData,
  g: ReturnType<typeof geometry>,
) {
  const label = input.style.polarAxis.labels;
  return data.categories.map((category, i) => {
    const angle = (i * Math.PI * 2) / Math.max(1, data.categories.length);
    const rotation =
      label.orientation === "fixed"
        ? 0
        : -angle + (label.orientation === "parallel" ? 0 : Math.PI / 2);
    return {
      type: "text",
      silent: true,
      x: g.center[0] + Math.sin(angle) * (g.radius + 22),
      y: g.center[1] - Math.cos(angle) * (g.radius + 22),
      rotation,
      style: {
        text: String(input.context.display.category(category)),
        fill: label.color,
        ...fontStyle(label),
        align: "center",
        verticalAlign: "middle",
      },
    };
  });
}
// Native radius labels follow the category-band edge; the original labels use the top ray.
function radialLabels(
  input: NightingaleMappingInput,
  g: ReturnType<typeof geometry>,
  extent: number[],
  ticks: number[],
) {
  const span = extent[1] - extent[0];
  return ticks.map((value) => ({
    type: "text",
    silent: true,
    z: 10,
    x: g.center[0] - 10,
    y:
      g.center[1] -
      g.inner -
      (span ? ((value - extent[0]) / span) * (g.radius - g.inner) : 0),
    style: {
      text: String(input.context.radialAxisLabel(value)),
      fill: input.style.polarAxis.labels.color,
      ...fontStyle(input.style.polarAxis.labels),
      align: "right",
      verticalAlign: "middle",
    },
  }));
}
function chrome(
  input: NightingaleMappingInput,
  data: NightingaleData,
): Pick<EChartsOption, "backgroundColor" | "title" | "legend"> {
  const a = input.style.application;
  const vertical = a.legend.position === "left" || a.legend.position === "right";
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    title: {
      show: a.title.enabled || a.subtitle.enabled,
      text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "",
      textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle),
      itemGap: a.title.enabled && a.title.text ? a.title.spacing : 0,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    legend: {
      show: a.legend.enabled,
      type: "scroll",
      orient: vertical ? "vertical" : "horizontal",
      [a.legend.position]:
        a.padding[a.legend.position as keyof typeof a.padding] +
        (a.legend.position === "top" ? captionSpace(input) : 0),
      ...(vertical ? { top: "middle" } : { left: "center" }),
      data: data.series.map((s) => s.id),
      selected: { ...input.context.legendSelection },
      formatter: (id: string) =>
        String(
          input.context.display.legend(
            data.series.find((s) => s.id === id)?.label ?? id,
          ),
        ),
      textStyle: {
        ...fontStyle(a.legend),
        padding: [
          a.legend.verticalSpacing / 2,
          a.legend.horizontalSpacing,
          a.legend.verticalSpacing / 2,
          a.legend.itemSpacing - 5,
        ],
      },
      padding: 0,
      itemGap: 0,
      itemWidth: a.legend.markerSize,
      itemHeight: a.legend.markerSize,
      itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
    },
  };
}
export function nightingaleLayout(
  input: NightingaleMappingInput,
  data: NightingaleData,
): EChartsOption {
  const g = geometry(input, data);
  const a = input.style.polarAxis;
  const density = linearTickDensity(
    g.radius - g.inner,
    Math.max(1, (measureText("0123456789", a.labels).height + 4) / 50),
  );
  const extent =
    data.extent[0] === data.extent[1]
      ? [...data.extent]
      : niceLinearExtent(data.extent, density);
  const ticks = linearRawTicks(extent as [number, number], density);
  const axisLine = { show: true, lineStyle: { color: a.color, width: a.thickness } };
  return {
    ...chrome(input, data),
    polar: { center: g.center, radius: [g.inner, g.radius] },
    angleAxis: {
      type: "category",
      data: [...data.rowIds],
      startAngle: 90 + 180 / Math.max(1, data.categories.length),
      clockwise: true,
      boundaryGap: true,
      axisLabel: { show: false },
      axisLine,
      axisTick: { show: false },
      splitLine: { show: false },
    },
    radiusAxis: {
      type: "value",
      min: extent[0],
      max: extent[1],
      ...(ticks.length > 1 ? { interval: ticks[1] - ticks[0] } : {}),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    graphic: [
      ...categoryLabels(input, data, g),
      ...radialLabels(input, g, extent, ticks),
    ] as EChartsOption["graphic"],
  };
}
