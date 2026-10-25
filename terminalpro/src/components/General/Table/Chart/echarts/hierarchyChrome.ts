import type { EChartsOption } from "echarts";
import { niceNumberExtent } from "./cartesianAxes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { hierarchyColorScale, hierarchyFraction } from "./hierarchyColor";
import { type HierarchyData, prepareHierarchyData } from "./hierarchyData";
import type { HierarchyHoverPlan } from "./hierarchyHoverTypes";
import type { HierarchyMappingInput } from "./hierarchyModel";

export const HIERARCHY_SERIES_ID = "qopenbb-hierarchy";
export const HIERARCHY_MARKER_ID = "qopenbb-hierarchy-gradient-marker";
interface LegendBounds {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly thickness: number;
  readonly vertical: boolean;
}
function captionSpace(input: HierarchyMappingInput) {
  return [input.style.application.title, input.style.application.subtitle].reduce(
    (sum, c) =>
      sum + (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
}
function ticks(model: HierarchyData, length: number): number[] {
  if (!model.extent) return [];
  const [min, max] = model.extent;
  if (min === max) return [min];
  const step = niceNumberExtent(min, max, length).interval;
  if (!step || !Number.isFinite(step)) return [min, max];
  const result: number[] = [];
  for (
    let index = Math.ceil(min / step);
    index <= Math.floor(max / step) && result.length < 100;
    index++
  )
    result.push(Number((index * step).toPrecision(14)));
  return result;
}
function coordinate(
  input: HierarchyMappingInput,
  legend: LegendBounds,
  model: HierarchyData,
  value: number,
): number {
  if (!model.extent) return legend.length / 2;
  const [min, max] = model.extent;
  if (min === max) return legend.length / 2;
  const fraction = hierarchyFraction(value, [min, max]);
  return (
    (input.style.gradientLegend.reverseOrder !== legend.vertical
      ? 1 - fraction
      : fraction) * legend.length
  );
}
function gradientGraphics(
  input: HierarchyMappingInput,
  model: HierarchyData,
  legend: LegendBounds,
) {
  const l = input.style.gradientLegend;
  const stops = hierarchyColorScale(input.style.palette.colorRange, [0, 1]).stops;
  const reverse = l.reverseOrder !== legend.vertical;
  const colors = reverse
    ? stops.map((s) => ({ offset: 1 - s.offset, color: s.color })).reverse()
    : stops;
  const labels = ticks(model, legend.length).map((value) => {
    const coordinateValue = coordinate(input, legend, model, value);
    return {
      type: "text",
      silent: true,
      x: legend.x + (legend.vertical ? legend.thickness + 5 : coordinateValue),
      y: legend.y + (legend.vertical ? coordinateValue : legend.thickness + 5),
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
          colorStops: colors,
        },
      },
    },
    ...labels,
    {
      id: HIERARCHY_MARKER_ID,
      type: "polygon",
      silent: true,
      invisible: true,
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
export function hierarchyChrome(input: HierarchyMappingInput, model: HierarchyData) {
  const a = input.style.application;
  const l = input.style.gradientLegend;
  const viewport = input.context.viewport;
  const padding = { ...a.padding, top: a.padding.top + captionSpace(input) };
  const width = Math.max(0, viewport.width - padding.left - padding.right);
  const height = Math.max(0, viewport.height - padding.top - padding.bottom);
  const vertical = l.position === "left" || l.position === "right";
  const visible =
    l.enabled &&
    input.projection.assignments.colorId !== undefined &&
    width > 0 &&
    height > 0;
  let legend: LegendBounds | undefined;
  if (visible) {
    const length = Math.max(
      0,
      Math.min(l.gradient.preferredLength, vertical ? height : width),
    );
    const labelWidth = Math.max(
      0,
      ...ticks(model, length).map(
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
    legend = { x, y, length, thickness: l.gradient.thickness, vertical };
    padding[l.position] += breadth + l.spacing;
  }
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
    graphic: (legend
      ? gradientGraphics(input, model, legend)
      : []) as EChartsOption["graphic"],
  };
  return { options, plot, legend };
}
export function projectHierarchyHover(
  input: HierarchyMappingInput,
): HierarchyHoverPlan | undefined {
  try {
    const model = prepareHierarchyData(input);
    const legend = hierarchyChrome(input, model).legend;
    if (
      !legend ||
      ![legend.x, legend.y, legend.length, legend.thickness].every(Number.isFinite)
    )
      return;
    const label = input.style.gradientLegend.label;
    return {
      seriesId: HIERARCHY_SERIES_ID,
      graphicId: HIERARCHY_MARKER_ID,
      project: (nodeId) => {
        const meta = model.metadata.get(nodeId);
        if (
          !meta ||
          meta.node.children.length ||
          meta.color === undefined ||
          !model.extent ||
          meta.node.subtreeWeight === 0
        )
          return;
        const position = coordinate(input, legend, model, meta.color);
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
