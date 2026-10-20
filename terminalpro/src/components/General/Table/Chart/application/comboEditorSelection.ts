import { deriveEditorEligibility } from "../compatibility/editorBindings/eligibility";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import type { EditorSelectionInput } from "../compatibility/editorBindings/types";
import type { ComboGeometry } from "../echarts/comboTypes";
import { sessionBindings } from "./applicationSessionSelection";
import { comboGeometryFamily } from "./comboAppearance";
import type { ComboSessionSelection } from "./comboSessionSelection";
import type { ComboSessionContext } from "./comboSessionTypes";

export function selectComboEditorGeometry(
  active: readonly ComboGeometry[],
  previous?: ComboGeometry,
): ComboGeometry {
  const selected = previous && active.includes(previous) ? previous : active[0];
  if (!selected) throw new Error("No active combo geometry");
  return selected;
}
export function comboEditorSelection(
  context: ComboSessionContext,
  selection: Omit<ComboSessionSelection, "editor">,
): EditorSelectionInput {
  const style = selection.resolved.views[selection.geometry];
  if (!style) throw new Error("Inactive combo editor geometry");
  const family = comboGeometryFamily(selection.geometry);
  const runtime = {
    axes: selection.resolved.axes.slice(0, 2),
    categoryAxisType: selection.resolved.axes[0].type,
  };
  const bindings = sessionBindings(runtime);
  const category = selection.projection.snapshot.rows[0]?.category;
  return {
    style,
    family,
    model: selection.baseline.model,
    range: selection.range,
    metadata: createEditorMetadata(style.application, bindings),
    eligibility: deriveEditorEligibility({
      family,
      firstDatum:
        category === undefined
          ? undefined
          : { [selection.setup.categoryId]: category },
      dimensionIds: [selection.setup.categoryId],
      grouping: false,
      categorySeriesSwitched: false,
      axisTypes: {
        category: bindings.category.optionType,
        number: bindings.number.optionType,
      },
    }),
  };
}
