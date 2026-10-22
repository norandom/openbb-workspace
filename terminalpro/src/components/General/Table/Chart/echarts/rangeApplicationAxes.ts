import type { EChartsOption, XAXisComponentOption } from "echarts";
import type { RangeAppearance } from "../application/rangeAppearance";
import type { RangeResolvedAxis } from "../application/rangeAxisAppearance";
import { fontStyle } from "./cartesianDisplay";
import { alternatingGrid, cartesianGrid } from "./cartesianGrid";
import type { rangeAxisLayout } from "./rangeAxisLayout";
import { rangeAxisFootprint } from "./rangeLabelLayout";

type RangeEngineAxis = Extract<XAXisComponentOption, { type?: "value" }>;

function decorate(
  core: RangeEngineAxis,
  axis: RangeResolvedAxis,
  rotation: number,
  labels: readonly string[],
  horizontal: boolean,
): RangeEngineAxis {
  const withoutTitle = { ...axis, title: { ...axis.title, enabled: false } };
  // ECharts reads the shared tick-model customValues at runtime for split lines too.
  const splitLine = {
    show: axis.grid.enabled && !alternatingGrid(axis),
    customValues: core.axisTick?.customValues,
    lineStyle: {
      color: axis.gridStyles.map((s) => s.stroke),
      width: axis.grid.thickness,
      type: [...axis.gridStyles[0].lineDash],
    },
  };
  return {
    ...core,
    name: axis.title.enabled ? axis.title.text : "",
    nameLocation: "middle",
    nameGap:
      rangeAxisFootprint(withoutTitle, labels, horizontal, rotation) +
      axis.title.spacing,
    nameMoveOverlap: false,
    nameTextStyle: fontStyle(axis.title),
    axisLabel: {
      ...core.axisLabel,
      show: axis.labels.enabled,
      hideOverlap: false,
      rotate: -rotation,
    },
    splitLine,
  };
}
export function rangeApplicationAxes(
  options: EChartsOption,
  appearance: RangeAppearance,
  layout: ReturnType<typeof rangeAxisLayout>,
  horizontal: boolean,
  valueLabels: readonly string[],
): EChartsOption {
  const axes = appearance.application.axes;
  const categoryKey = horizontal ? "yAxis" : "xAxis";
  const valueKey = horizontal ? "xAxis" : "yAxis";
  const category = decorate(
    options[categoryKey] as RangeEngineAxis,
    axes.category,
    layout.category.rotation,
    layout.category.plan.ticks.map((t) => t.label),
    !horizontal,
  );
  const numeric = decorate(
    options[valueKey] as RangeEngineAxis,
    axes.number,
    layout.numeric.rotation,
    valueLabels,
    horizontal,
  );
  return {
    ...options,
    [categoryKey]: category,
    [valueKey]: numeric,
    ...cartesianGrid(appearance.application),
  };
}
