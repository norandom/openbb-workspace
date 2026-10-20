import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { XyChartType } from "../compatibility/xyAssignments";
import { resolveXyAssignments } from "../compatibility/xyAssignments";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { EditorSelectionInput } from "../compatibility/editorBindings/types";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { sessionBaseline, sessionRange, sessionSetup, sessionBindings } from "./applicationSessionSelection";
import { projectOrdinarySetup } from "./setupProjection";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import { resolveXyAppearance, xyAxesRuntime } from "./xyAppearance";
import { xyRoles, type XyEditorProjection } from "./xySessionTypes";

export function selectXySession(storage: ChartStorageOutput, context: ApplicationSessionContext<XyChartType>) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = { ...sessionSetup(baseline.model, range, context), switchCategorySeries: false };
  const projected = projectOrdinarySetup(context.capture, setup, "xy-coordinates");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const resolved = resolveXyAppearance({
    ...context.inputs, baseline, seriesIds: setup.seriesIds, axisRuntime: xyAxesRuntime,
    defaultTitles: { enabled: range.columnIds.length <= 5,
      x: context.inputs.columns.find((c) => c.id === setup.seriesIds[0])?.label ?? "Axis Title",
      y: context.inputs.columns.find((c) => c.id === setup.seriesIds[1])?.label ?? "Axis Title" },
  });
  const assignments = resolveXyAssignments({
    chartType: context.inputs.family, paired: resolved.paired,
    valueColumns: setup.seriesIds.map((colId) => ({ colId, selected: true })),
  });
  if (assignments.status !== "resolved") throw Error(assignments.diagnostics[0].message);
  const xy: XyEditorProjection = {
    chartType: context.inputs.family, paired: resolved.paired,
    roles: xyRoles(setup.seriesIds, context.inputs.family, resolved.paired),
    labels: setup.categoryId === DEFAULT_SETUP_CATEGORY ? "y" : "category",
    style: resolved.style,
  };
  const axes = { type: false, timeFormat: false, position: true,
    grid: true, ticks: true, tickLength: true, autoRotate: false };
  const selection: EditorSelectionInput = {
    family: context.inputs.family, style: { application: resolved.application },
    model: baseline.model, range,
    metadata: createEditorMetadata(resolved.application, sessionBindings(xyAxesRuntime)),
    eligibility: { legend: true, shadow: false, labels: true, markers: true,
      connectMissingData: false, axes: { category: axes, number: axes } },
  };
  const editor = selectApplicationEditorState(selection);
  if (!editor.valid) throw Error(editor.error);
  return { baseline, range, setup, projection: projected.value, xy,
    assignments: assignments.assignments, selection, editor: editor.value };
}
