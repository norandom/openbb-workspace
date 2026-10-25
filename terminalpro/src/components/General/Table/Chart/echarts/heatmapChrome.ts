import type { EChartsOption } from "echarts";
import type {
  GradientHoverPlan,
  HeatmapMappingInput,
} from "../application/heatmapTypes";
import { niceNumberExtent } from "./cartesianAxes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { heatmapAxisSpace } from "./heatmapAxes";
import { heatmapCellId } from "./heatmapCells";
import { buildHeatmapData, type HeatmapData } from "./heatmapData";
import { hierarchyColorScale, hierarchyFraction } from "./hierarchyColor";

export const HEATMAP_SERIES_ID = "qopenbb-heatmap";
export const HEATMAP_MARKER_ID = "qopenbb-heatmap-gradient-marker";
interface Legend {
  x: number;
  y: number;
  length: number;
  thickness: number;
  vertical: boolean;
}
function values(model: HeatmapData, length = 200): number[] {
  if (!model.extent) return [];
  const [min, max] = model.extent;
  if (min === max) return [min];
  const step = niceNumberExtent(min, max, length).interval;
  if (!step || !Number.isFinite(step)) return [min, max];
  const ticks: number[] = [];
  for (
    let index = Math.ceil(min / step);
    index <= Math.floor(max / step) && ticks.length < 100;
    index++
  )
    ticks.push(Number((index * step).toPrecision(14)));
  return ticks.length ? ticks : [min, max];
}
function coordinate(
  input: HeatmapMappingInput,
  legend: Legend,
  model: HeatmapData,
  value: number,
) {
  if (!model.extent || model.extent[0] === model.extent[1]) return legend.length / 2;
  const fraction = hierarchyFraction(value, model.extent);
  return (
    (input.style.gradientLegend.reverseOrder !== legend.vertical
      ? 1 - fraction
      : fraction) * legend.length
  );
}
function graphics(input: HeatmapMappingInput, model: HeatmapData, legend: Legend) {
  const l = input.style.gradientLegend;
  const colors = input.style.colorRange;
  const constant = model.extent?.[0] === model.extent?.[1];
  const stops = constant
    ? [
        { offset: 0, color: colors[Math.floor(colors.length / 2)] },
        { offset: 1, color: colors[Math.floor(colors.length / 2)] },
      ]
    : hierarchyColorScale(colors, [0, 1]).stops;
  const reverse = l.reverseOrder !== legend.vertical;
  const colorStops = reverse
    ? stops.map((stop) => ({ offset: 1 - stop.offset, color: stop.color })).reverse()
    : stops;
  const labels = values(model, legend.length).map((value) => {
    const position = coordinate(input, legend, model, value);
    return {
      type: "text",
      silent: true,
      x: legend.x + (legend.vertical ? legend.thickness + 5 : position),
      y: legend.y + (legend.vertical ? position : legend.thickness + 5),
      style: {
        ...fontStyle(l.label),
        fill: l.label.color,
        text: String(input.context.display.numericAxis(value)),
        align: legend.vertical ? "left" : "center",
        verticalAlign: legend.vertical ? "middle" : "top",
      },
    };
  });
  return [
    {
      type: "rect",
      silent: true,
      shape: {
        x: legend.x,
        y: legend.y,
        width: legend.vertical ? legend.thickness : legend.length,
        height: legend.vertical ? legend.length : legend.thickness,
      },
      style: {
        fill: {
          type: "linear",
          x: 0,
          y: 0,
          x2: legend.vertical ? 0 : 1,
          y2: legend.vertical ? 1 : 0,
          colorStops,
        },
      },
    },
    ...labels,
    {
      id: HEATMAP_MARKER_ID,
      type: "polygon",
      invisible: true,
      silent: true,
      z: 20,
      shape: {
        points: [
          [0, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
        ],
      },
      style: { fill: l.label.color },
    },
  ];
}
function legendLayout(
  input: HeatmapMappingInput,
  model: HeatmapData,
  padding: { top: number; right: number; bottom: number; left: number },
): Legend | undefined {
  const l = input.style.gradientLegend;
  const viewport = input.context.viewport;
  const width = Math.max(0, viewport.width - padding.left - padding.right);
  const height = Math.max(0, viewport.height - padding.top - padding.bottom);
  if (!l.enabled || !model.extent || !width || !height) return;
  const vertical = l.position === "right" || l.position === "left";
  const length = Math.min(l.gradient.preferredLength, vertical ? height : width);
  const labelWidth = Math.max(
    0,
    ...values(model, length).map(
      (value) =>
        measureText(String(input.context.display.numericAxis(value)), l.label).width,
    ),
  );
  const breadth =
    l.gradient.thickness + 5 + (vertical ? labelWidth : l.label.size * 1.2);
  const x = vertical
    ? l.position === "left"
      ? padding.left
      : viewport.width - padding.right - breadth
    : padding.left + (width - length) / 2;
  const y = vertical
    ? padding.top + (height - length) / 2
    : l.position === "top"
      ? padding.top
      : viewport.height - padding.bottom - breadth;
  padding[l.position] += breadth + l.spacing;
  return { x, y, length, thickness: l.gradient.thickness, vertical };
}
export function heatmapChrome(
  input: HeatmapMappingInput,
  model = buildHeatmapData(input.projection),
) {
  const a = input.style.application;
  const caption = [a.title, a.subtitle].reduce(
    (sum, c) =>
      sum + (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
  const padding = {
    ...a.padding,
    top: a.padding.top + caption,
    bottom: a.padding.bottom,
    left: a.padding.left,
  };
  const legend = legendLayout(input, model, padding);
  const viewport = input.context.viewport;
  const space = heatmapAxisSpace(
    input,
    model,
    viewport.width - padding.left - padding.right,
    viewport.height - padding.top - padding.bottom,
  );
  padding.left += space.left;
  padding.bottom += space.bottom;
  const plot = {
    x: Math.min(viewport.width, padding.left),
    y: Math.min(viewport.height, padding.top),
    width: Math.max(0, viewport.width - padding.left - padding.right),
    height: Math.max(0, viewport.height - padding.top - padding.bottom),
  };
  const options: EChartsOption = {
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
    graphic: (model.x.length && model.y.length
      ? legend
        ? graphics(input, model, legend)
        : []
      : [
          {
            type: "text",
            silent: true,
            x: viewport.width / 2,
            y: viewport.height / 2,
            style: {
              text: "No data available to be charted",
              fill: input.style.axes.x.labels.color,
              align: "center",
              verticalAlign: "middle",
            },
          },
        ]) as EChartsOption["graphic"],
  };
  return { options, plot, legend };
}
export function projectHeatmapHover(
  input: HeatmapMappingInput,
): GradientHoverPlan | undefined {
  try {
    const model = buildHeatmapData(input.projection);
    const legend = heatmapChrome(input, model).legend;
    if (!legend) return;
    const cells = new Map(
      model.cells.map((cell) => [heatmapCellId(cell.rowId, cell.columnId), cell]),
    );
    const label = input.style.gradientLegend.label;
    return {
      seriesId: HEATMAP_SERIES_ID,
      graphicId: HEATMAP_MARKER_ID,
      project: (id) => {
        const cell = cells.get(id);
        if (!cell) return;
        const position = coordinate(input, legend, model, cell.value);
        return {
          x: legend.x + (legend.vertical ? -label.size / 2 : position),
          y: legend.y + (legend.vertical ? position : -label.size / 2),
          rotation: legend.vertical ? Math.PI / 2 : Math.PI,
          size: label.size,
          color: label.color,
        };
      },
    };
  } catch {
    return;
  }
}
