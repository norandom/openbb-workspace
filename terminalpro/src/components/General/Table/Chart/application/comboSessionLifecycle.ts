import { resolveComboAssignments } from "../compatibility/comboAssignments";
import type { ApplicationSessionLocal } from "./applicationSessionTypes";
import type { ComboConcreteAxis } from "./comboAppearance";
import { isComboChartFamily } from "./comboSessionTypes";
/** Data rebuilding recreates positions, retaining only the category's semantic type. */
export function rebuildComboAxes(
  local: ApplicationSessionLocal,
  categoryId: string,
): ApplicationSessionLocal {
  const family = local.baseline.chartType;
  if (!isComboChartFamily(family)) return local;
  const category =
    local.comboAxes?.[0] ?? local.axes.axes.find((a) => a.id === "category");
  const ids = local.range.columnIds.filter((id) => id !== categoryId);
  const resolved = resolveComboAssignments({
    chartType: family,
    valueColumns: ids.map((colId) => ({ colId, selected: true })),
    ...(family === "customCombo"
      ? { seriesChartTypes: local.baseline.model.seriesChartTypes }
      : {}),
  });
  if (resolved.status !== "resolved") return { ...local, comboAxes: undefined };
  const axes: ComboConcreteAxis[] = [
    {
      key: "category",
      id: "category",
      direction: "x",
      type: category?.type ?? "category",
      position: "bottom",
      options: {},
    },
  ];
  if (resolved.seriesChartTypes.some((a) => !a.secondaryAxis))
    axes.push({
      key: "primary",
      id: "number",
      direction: "y",
      type: "number",
      position: "left",
      options: {},
    });
  for (const a of resolved.seriesChartTypes.filter((a) => a.secondaryAxis))
    axes.push({
      key: "secondary:" + a.colId,
      colId: a.colId,
      id: "number",
      direction: "y",
      type: "number",
      position: "right",
      options: {},
    });
  return {
    ...local,
    comboAxes: axes,
    manualRotations: { category: undefined, number: undefined },
  };
}
