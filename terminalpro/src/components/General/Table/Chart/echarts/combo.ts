import type { EChartsOption, LegendComponentOption } from "echarts";
import { mappingIssue } from "./cartesianAdmission";
import { cartesianGrid } from "./cartesianGrid";
import { applicationLayout } from "./cartesianLayout";
import { cartesianTooltip } from "./cartesianTooltip";
import { admitCombo } from "./comboAdmission";
import { comboAxes } from "./comboAxes";
import { comboSeries } from "./comboSeries";
import type { ComboPlan, TranslateCombo } from "./comboTypes";

function finiteGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite combo geometry.");
  if (Array.isArray(value)) value.forEach(finiteGeometry);
}
function options(plan: ComboPlan): EChartsOption {
  const columns = plan.selected.map((s) => s.column);
  const view = plan.views[plan.selected[0].geometry]!;
  const appearance = view.application!;
  const layout = applicationLayout(
    appearance,
    columns,
    plan.context.display,
    "groupedColumn",
    plan.context.viewport!,
  );
  const axes = comboAxes(plan);
  const grid = layout.grid as {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  const series = comboSeries(plan);
  series.forEach((s) => finiteGeometry(s.data));
  axes.yAxis.forEach((axis) => {
    finiteGeometry(axis.min);
    finiteGeometry(axis.max);
  });
  return {
    animation: false,
    textStyle: {
      color: view.textColor,
      fontFamily: view.fontFamily,
      fontSize: view.fontSize,
    },
    color: [...view.palette],
    ...cartesianGrid(appearance),
    ...layout,
    grid: {
      ...grid,
      left: grid.left + axes.leftMargin,
      right: grid.right + axes.rightMargin,
    },
    legend: {
      ...(layout.legend as LegendComponentOption),
      selected: { ...plan.context.legendSelection },
    },
    xAxis: axes.xAxis,
    yAxis: [...axes.yAxis],
    series,
    tooltip: cartesianTooltip(
      plan.snapshot,
      columns.filter((c) => plan.context.legendSelection?.[c.id] !== false),
      view,
      plan.context.display,
    ),
  };
}
/** Pure inactive mapper; failed admission or derived geometry never returns partial options. */
export const translateCombo: TranslateCombo = (input) => {
  try {
    const admission = admitCombo(input);
    if (admission.status !== "admitted") return admission;
    return { status: "supported", options: options(admission.plan) };
  } catch {
    return {
      status: "invalid",
      diagnostics: [
        mappingIssue(
          "invalid-combo-geometry",
          ["snapshot"],
          "Combo input cannot be safely inspected or projected into finite geometry.",
        ),
      ],
    };
  }
};
