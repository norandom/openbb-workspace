import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { PieChartType } from "../compatibility/pieAssignments";
import { translatePie } from "../echarts/pie";
import type { PieMappingInput } from "../echarts/pieTypes";
import type { ApplicationSessionInputs, ApplicationSessionState } from "./applicationSessionTypes";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { contextFor } from "./applicationSessionRuntime";
import { invalidSession } from "./applicationSessionEdit";
import { selectPieSession } from "./pieSessionSelection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

export function projectPieSession(storage: ChartStorageOutput, inputs: ApplicationSessionInputs<PieChartType>,
  state: ApplicationSessionState): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectPieSession(storage, contextFor(inputs, state));
    const mapping: PieMappingInput = { snapshot: structuredClone(selected.projection.snapshot), assignment: structuredClone(selected.assignment),
      style: structuredClone(selected.pie.style), context: { observations: { kind: "raw-observations" }, display: { ...inputs.display }, viewport: { ...state.viewport } } };
    const result = translatePie(mapping);
    if (result.status !== "supported") return { status: result.status === "invalid" ? "invalid" : "unresolved", diagnostics: result.diagnostics };
    const projectLegendSelection = (legendSelection: Readonly<Record<string, boolean>>) => {
      const next = translatePie({ ...mapping, context: { ...mapping.context, legendSelection } });
      if (next.status !== "supported") throw Error(next.diagnostics[0]?.message ?? "Invalid pie legend projection");
      return next.options;
    };
    const choice = (column: ApplicationSessionInputs["columns"][number]) => ({ value: column.id, label: column.label });
    return { status: "ready", stamp: state.local.stamp, value: {
      kind: "pie", stamp: state.local.stamp, revision: state.local.stamp.renderRevision, options: result.options,
      editor: selected.editor, model: selected.baseline.model, snapshot: selected.projection.snapshot,
      legendScope: JSON.stringify([inputs.address.stateAddress, state.local.stamp.generation, inputs.family]), projectLegendSelection,
      setupProps: { value: { categoryId: selected.setup.categoryId, aggregate: selected.setup.aggFunc !== undefined,
        aggregationMethod: selected.setup.aggFunc ?? "sum", switchCategorySeries: selected.setup.switchCategorySeries,
        series: selected.setup.seriesIds.map(id => ({ id, label: inputs.columns.find(c => c.id === id)?.label ?? id })) },
        categories: inputs.columns.filter(c => c.role === "category").map(choice), availableSeries: inputs.columns.filter(c => c.role === "number").map(choice),
        aggregationMethods: SETUP_AGGREGATIONS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) },
    } };
  } catch (error) { return invalidSession(error instanceof Error ? error.message : "Invalid pie projection"); }
}
