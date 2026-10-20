import type { BarSeriesOption, LineSeriesOption } from "echarts";
import { projectArea } from "./cartesianArea";
import { cartesianAreaSeries } from "./cartesianAreaSeries";
import { applicationSeries } from "./cartesianSeries";
import { seriesAppearance } from "./cartesianStyle";
import type { ComboPlan, ComboSelectedSeries } from "./comboTypes";

type NativeSeries = BarSeriesOption | LineSeriesOption;
function ordinarySeries(
  plan: ComboPlan,
  item: ComboSelectedSeries,
): NativeSeries {
  const { snapshot, context } = plan;
  const style = plan.views[item.geometry]!;
  const family =
    item.geometry === "line"
      ? "line"
      : item.assignment.chartType === "stackedColumn"
        ? "stackedColumn"
        : "groupedColumn";
  return {
    ...seriesAppearance(style, item.column.id, item.paletteIndex, family),
    ...applicationSeries(
      style,
      item.column,
      item.paletteIndex,
      snapshot,
      family,
      context.display,
    ),
    id: item.column.id,
    name: item.column.id,
    type: item.geometry === "line" ? "line" : "bar",
    yAxisIndex: item.yAxisIndex,
    data: snapshot.rows.map((row, i) => [
      plan.coordinates[i],
      row.values[item.column.id] ?? null,
    ]),
    ...(family === "stackedColumn"
      ? { stack: "openbb-combo-columns", stackStrategy: "samesign" as const }
      : {}),
  } as NativeSeries;
}
function areaSeries(plan: ComboPlan): Map<string, LineSeriesOption[]> {
  const result = new Map<string, LineSeriesOption[]>();
  const style = plan.views.area;
  if (!style) return result;
  const reserved = new Set(plan.selected.map((s) => s.column.id));
  for (const family of ["area", "stackedArea"] as const) {
    const items = plan.selected.filter(
      (s) => s.assignment.chartType === family,
    );
    if (!items.length) continue;
    const columns = items.map((s) => s.column);
    const projection = projectArea({
      snapshot: plan.snapshot,
      columns,
      family,
      connectMissingData: style.application!.series.connectMissingData,
      legendSelection: plan.context.legendSelection,
    });
    const fragments = cartesianAreaSeries(
      plan.snapshot,
      columns,
      style,
      plan.context.display,
      projection,
      {
        paletteIndexes: items.map((s) => s.paletteIndex),
        reservedIds: reserved,
        coordinates: plan.coordinates,
      },
    );
    let pending: LineSeriesOption[] = [];
    for (const fragment of fragments) {
      pending.push(fragment);
      const item = items.find((s) => s.column.id === fragment.id);
      if (!item) continue;
      result.set(
        item.column.id,
        pending.map((s) => ({ ...s, yAxisIndex: item.yAxisIndex })),
      );
      pending = [];
    }
  }
  return result;
}
/** Geometry follows selected order; subgroup filtering never restarts palette identity. */
export function comboSeries(plan: ComboPlan): NativeSeries[] {
  const areas = areaSeries(plan);
  return plan.selected.flatMap((item) =>
    item.geometry === "area"
      ? (areas.get(item.column.id) ?? [])
      : [ordinarySeries(plan, item)],
  );
}
