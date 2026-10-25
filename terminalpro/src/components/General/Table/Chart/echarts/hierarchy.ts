import type { EChartsOption } from "echarts";
import { HIERARCHY_SERIES_ID, hierarchyChrome } from "./hierarchyChrome";
import { HierarchyPaintAdapterRequired } from "./hierarchyColor";
import { type HierarchyData, prepareHierarchyData } from "./hierarchyData";
import type { HierarchyMappingInput, TranslateHierarchy } from "./hierarchyModel";
import { hierarchyTooltip } from "./hierarchyTooltip";

function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite hierarchy input.");
  if (value !== null && typeof value === "object") Object.values(value).forEach(finite);
}
function admitPaint(input: HierarchyMappingInput): void {
  const s = input.style;
  const l = s.gradientLegend;
  const labels =
    s.family === "treemap" ? [s.group.label, s.tile.label] : [s.series.label];
  const dimensions = [
    s.common.fontSize,
    l.spacing,
    l.gradient.thickness,
    l.gradient.preferredLength,
    l.label.size,
    ...labels.flatMap((label) => [label.size, label.spacing]),
    ...(s.family === "treemap"
      ? [
          s.group.padding,
          s.group.gap,
          s.group.strokeWidth,
          s.tile.padding,
          s.tile.gap,
          s.tile.strokeWidth,
        ]
      : [s.series.padding, s.series.sectorSpacing, s.series.strokeWidth]),
  ];
  if (dimensions.some((v) => typeof v !== "number" || v < 0))
    throw Error("Invalid hierarchy paint dimension.");
  const opacities =
    s.family === "treemap"
      ? [
          s.group.fillOpacity,
          s.group.strokeOpacity,
          s.tile.fillOpacity,
          s.tile.strokeOpacity,
        ]
      : [s.series.fillOpacity, s.series.strokeOpacity];
  if (opacities.some((v) => typeof v !== "number" || v < 0 || v > 1))
    throw Error("Invalid hierarchy opacity.");
  if (!["top", "right", "bottom", "left"].includes(l.position))
    throw Error("Invalid hierarchy legend position.");
}
function admit(input: HierarchyMappingInput): void {
  if (
    !["treemap", "sunburst"].includes(input.family) ||
    input.family !== input.style.family
  )
    throw Error("Invalid hierarchy family.");
  finite(input.style);
  admitPaint(input);
  finite(input.context.viewport);
  if (input.context.viewport.width < 0 || input.context.viewport.height < 0)
    throw Error("Invalid viewport.");
  const p = input.style.palette;
  if (
    ![
      p.fills,
      p.strokes,
      p.hierarchyColors,
      p.secondHierarchyColors,
      p.colorRange,
    ].every((v) => v.length > 0)
  )
    throw Error("Empty hierarchy palette.");
  if (Object.values(input.style.application.padding).some((v) => v < 0))
    throw Error("Invalid hierarchy padding.");
}
function series(
  input: HierarchyMappingInput,
  model: HierarchyData,
  plot: ReturnType<typeof hierarchyChrome>["plot"],
) {
  const s = input.style;
  const data = plot.width > 0 && plot.height > 0 ? model.data : [];
  const base = {
    id: HIERARCHY_SERIES_ID,
    data,
    nodeClick: false,
    animation: false,
    emphasis: { focus: "none" },
  };
  if (s.family === "treemap")
    return {
      ...base,
      type: "treemap",
      left: plot.x,
      top: plot.y,
      width: plot.width,
      height: plot.height,
      sort: false,
      squareRatio: 1,
      visibleMin: 0,
      childrenVisibleMin: 0,
      roam: false,
      breadcrumb: { show: false },
      itemStyle: {
        borderWidth: 0,
        gapWidth: model.data.every((n) => !n.children?.length)
          ? s.tile.gap
          : s.group.gap,
      },
      label: {
        show: s.tile.label.enabled,
        align: s.tile.textAlign,
        verticalAlign: s.tile.verticalAlign,
      },
      upperLabel: { show: s.group.label.enabled },
    };
  return {
    ...base,
    type: "sunburst",
    center: [plot.x + plot.width / 2, plot.y + plot.height / 2],
    radius: [0, Math.min(plot.width, plot.height) / 2],
    sort: null,
    startAngle: 90,
    clockwise: true,
    minAngle: 0,
    stillShowZeroSum: false,
    renderLabelForZeroData: false,
    label: { show: s.series.label.enabled, rotate: "tangential" },
  };
}
/** Inactive native translator; the application retains model, host, resize and export ownership. */
export const translateHierarchy: TranslateHierarchy = (input) => {
  try {
    admit(input);
    const model = prepareHierarchyData(input);
    const chrome = hierarchyChrome(input, model);
    const c = input.style.common;
    const options = {
      animation: false,
      textStyle: { color: c.textColor, fontFamily: c.fontFamily, fontSize: c.fontSize },
      ...chrome.options,
      tooltip: hierarchyTooltip(input, model),
      series: [series(input, model, chrome.plot)],
    } as EChartsOption;
    finite(options);
    return { status: "supported", options };
  } catch (error) {
    if (error instanceof HierarchyPaintAdapterRequired)
      return {
        status: "unsupported",
        diagnostics: [
          { code: "hierarchy-paint-adapter", path: ["style"], message: error.message },
        ],
      };
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-input",
          path: [],
          message:
            "Hierarchy input could not be safely projected into finite native geometry.",
        },
      ],
    };
  }
};
