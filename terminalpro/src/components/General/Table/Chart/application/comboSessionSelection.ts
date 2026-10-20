import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { ApplicationEditorState } from "../compatibility/editorBindings/types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ComboGeometry } from "../echarts/comboTypes";
import { sessionSetup } from "./applicationSessionSelection";
import {
  activeComboGeometries,
  resolveComboAppearance,
  type ComboAppearanceSelection,
} from "./comboAppearance";
import {
  comboEditorSelection,
  selectComboEditorGeometry,
} from "./comboEditorSelection";
import { selectComboSessionAssignments } from "./comboSessionAssignments";
import type {
  ComboSessionAssignmentSelection,
  ComboSessionContext,
} from "./comboSessionTypes";
import { projectOrdinarySetup } from "./setupProjection";
import type { SetupProjection, SetupSelection } from "./setupTypes";
import type { SessionResult } from "./types";

export interface ComboSessionSelection extends ComboSessionAssignmentSelection {
  readonly family: "combo";
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly resolved: ComboAppearanceSelection;
  readonly geometry: ComboGeometry;
  readonly activeGeometries: readonly ComboGeometry[];
  readonly editor: ApplicationEditorState;
}
export function selectComboSession(
  storage: ChartStorageOutput,
  context: ComboSessionContext,
): SessionResult<ComboSessionSelection> {
  const assignments = selectComboSessionAssignments(storage, context);
  if (assignments.status !== "ready") return assignments;
  try {
    const selected = assignments.value;
    const setup = sessionSetup(
      selected.baseline.model,
      selected.range,
      context,
    );
    const projected = projectOrdinarySetup(
      context.capture,
      setup,
      "combo-per-axis",
    );
    if (projected.status !== "ready")
      throw new Error(projected.diagnostics[0].message);
    const seriesIds = projected.value.snapshot.selectedColumnIds.filter(
      (id) => id !== setup.categoryId,
    );
    const resolved = resolveComboAppearance({
      baseline: selected.baseline,
      generated: context.inputs.generated,
      theme: context.inputs.theme,
      precision: context.inputs.precision,
      seriesIds,
      assignments: selected.seriesChartTypes,
      concreteAxes: context.local.comboAxes,
    });
    if (!resolved.valid) throw new Error(resolved.error);
    const activeGeometries = activeComboGeometries(
      selected.seriesChartTypes,
      seriesIds,
    );
    const geometry = selectComboEditorGeometry(
      activeGeometries,
      context.local.comboGeometry,
    );
    const base = {
      ...selected,
      family: "combo" as const,
      setup,
      projection: projected.value,
      resolved: resolved.value,
      geometry,
      activeGeometries,
    };
    const editor = selectApplicationEditorState(
      comboEditorSelection(context, base),
    );
    if (!editor.valid) throw new Error(editor.error);
    return {
      status: "ready",
      stamp: context.local.stamp,
      value: { ...base, editor: editor.value },
    };
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "combo-selection",
          path: [],
          message:
            error instanceof Error ? error.message : "Invalid combo selection",
        },
      ],
    };
  }
}
