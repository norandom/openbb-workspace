import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { projectArea } from "./cartesianArea";
import { applicationAxes } from "./cartesianAxes";
import { measureText } from "./cartesianLayout";
import type { ComboAxisGroup, ComboPlan } from "./comboTypes";
export interface ComboAxesResult {
  readonly xAxis: XAXisComponentOption;
  readonly yAxis: readonly YAXisComponentOption[];
  readonly coordinates: readonly (string | number)[];
  /** Required outer plot allowance for all right numeric axes. */
  readonly rightMargin: number;
  readonly leftMargin: number;
}
function extent(
  plan: ComboPlan,
  group: ComboAxisGroup,
): { min: number; max: number } {
  let min = 0,
    max = 0;
  const include = (value: number) => {
    if (!Number.isFinite(value)) throw new Error("Nonfinite combo geometry.");
    min = Math.min(min, value);
    max = Math.max(max, value);
  };
  const visible = group.selected.filter(
    (s) => plan.context.legendSelection?.[s.column.id] !== false,
  );
  for (const row of plan.snapshot.rows) {
    let positive = 0,
      negative = 0;
    for (const s of visible) {
      const value = row.values[s.column.id];
      if (typeof value !== "number" || s.geometry === "area") continue;
      if (s.assignment.chartType === "stackedColumn") {
        if (value >= 0) positive += value;
        else negative += value;
      } else include(value);
    }
    include(positive);
    include(negative);
  }
  for (const family of ["area", "stackedArea"] as const) {
    const columns = group.selected
      .filter((s) => s.assignment.chartType === family)
      .map((s) => s.column);
    if (!columns.length) continue;
    const area = projectArea({
      snapshot: plan.snapshot,
      columns,
      family,
      connectMissingData: plan.style.geometry.area!.series.connectMissingData,
      legendSelection: plan.context.legendSelection,
    });
    include(area.extent.min ?? 0);
    include(area.extent.max ?? 0);
  }
  return { min, max };
}
function tickValues(
  axis: YAXisComponentOption,
  domain: { min: number; max: number },
): number[] {
  const min = typeof axis.min === "number" ? axis.min : domain.min;
  const max = typeof axis.max === "number" ? axis.max : domain.max;
  const interval = "interval" in axis ? axis.interval : undefined;
  const count =
    typeof interval === "number" && interval > 0 ? (max - min) / interval : 0;
  if (!Number.isFinite(count) || count < 1 || count > 1000) return [min, max];
  return [
    ...Array.from(
      { length: Math.floor(count) + 1 },
      (_, i) => min + i * (interval as number),
    ),
    max,
  ];
}
function allowance(
  plan: ComboPlan,
  group: ComboAxisGroup,
  rendered: YAXisComponentOption,
  domain: { min: number; max: number },
): number {
  const axis = group.axis;
  const angle = ((axis.labels.rotation ?? 0) * Math.PI) / 180;
  const labelWidth = Math.max(
    0,
    ...tickValues(rendered, domain).map((value) => {
      const size = measureText(
        String(plan.context.display.numericAxis(value)),
        axis.labels,
      );
      return (
        Math.abs(size.width * Math.cos(angle)) +
        Math.abs(size.height * Math.sin(angle))
      );
    }),
  );
  const title =
    axis.title.enabled && axis.title.text
      ? axis.title.spacing + measureText(axis.title.text, axis.title).height
      : 0;
  return (
    Math.max(
      labelWidth + axis.labels.padding,
      axis.ticks.enabled ? axis.ticks.length : 0,
      title,
    ) + 12
  );
} /** Shared category coordinates and axis identities are independent of legend state. */
export function comboAxes(plan: ComboPlan): ComboAxesResult {
  const viewport = plan.context.viewport!;
  let rightMargin = 0,
    leftMargin = 0;
  const yAxis = plan.axisGroups.map((group) => {
    const domain = extent(plan, group);
    const pair = applicationAxes(
      plan.style.axes.category,
      group.axis,
      plan.snapshot,
      plan.context.display,
      viewport,
      "area",
      domain,
    );
    const axis = pair.yAxis;
    if (group.axis.fields.position === "right") {
      const offset = rightMargin;
      rightMargin += allowance(plan, group, axis, domain);
      return { ...axis, offset };
    }
    const offset = leftMargin;
    leftMargin += allowance(plan, group, axis, domain);
    return { ...axis, offset };
  });
  // Bars supply categorical row-index coordinates; every combo geometry uses these.
  const first = plan.axisGroups[0];
  const xAxis = applicationAxes(
    plan.style.axes.category,
    first.axis,
    plan.snapshot,
    plan.context.display,
    viewport,
    "groupedColumn",
  ).xAxis;
  return {
    xAxis,
    yAxis,
    coordinates: plan.coordinates,
    rightMargin,
    leftMargin,
  };
}
