import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { resolvePieAssignments, type PieChartType } from "../compatibility/pieAssignments";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { sessionBaseline, sessionRange, sessionSetup } from "./applicationSessionSelection";
import { projectOrdinarySetup } from "./setupProjection";
import { resolvePieAppearance } from "./pieAppearance";
import { projectPieEditorState } from "./pieEditorState";

export function selectPieSession(storage: ChartStorageOutput, context: ApplicationSessionContext<PieChartType>) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup, "pie-observations");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const snapshot = projected.value.snapshot;
  const seriesIds = snapshot.selectedColumnIds.filter(id => snapshot.columns.some(c => c.id === id && c.role === "number"));
  const assignment = resolvePieAssignments({ chartType: context.inputs.family, valueColumns: seriesIds.map(colId => ({ colId, selected: true })) });
  if (assignment.status !== "resolved") throw Error(assignment.diagnostics[0].message);
  const pie = resolvePieAppearance({ ...context.inputs, baseline, seriesIds });
  return { baseline, range, setup, projection: projected.value, assignment, pie, editor: projectPieEditorState(pie.style) };
}
